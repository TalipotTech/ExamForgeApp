# ExamForge → Railway Deployment Playbook (agent-executable)

A step-by-step playbook for deploying **ExamForge** to **Railway**, distilled from a real
deploy of the sister project **Padvik** (same stack). Written so an AI agent can execute it
end-to-end from this repo. **Read §0 and §1 (Gotchas) before doing anything** — they are
the mistakes that cost the most time and only surface on Railway.

> ExamForge shares Padvik's architecture: **Next.js 15 (App Router) + TypeScript +
> Tailwind v4 + Drizzle/Postgres (postgres-js) + Redis/BullMQ workers + Auth.js (NextAuth
> v5) + Serwist PWA, package manager pnpm.** If this repo diverges, adapt — but the gotchas
> below are stack-level and almost certainly still apply.

---

## 0. Inputs (this repo)

| Input                        | Value / how to get it                                          |
| ---------------------------- | -------------------------------------------------------------- |
| GitHub repo slug             | **`TalipotTech/ExamForgeApp`**                                 |
| Local repo path              | `E:\DEVELOPMENT\WEBSITE\ENSATE\INHOUSE\ExamForge\ExamForgeApp` |
| Default branch               | `git branch --show-current` (assume `main`)                    |
| Railway project name         | `examforge`                                                    |
| Populated secrets            | `.env.local` (gitignored)                                      |
| Public domain (later)        | generated in §5 → `examforge-production-xxxx.up.railway.app`   |
| Copy prod DB from local?     | **ask the user**                                               |
| Background workers in scope? | **ask the user** (Padvik: yes)                                 |

**Confirm the stack before tailoring** (ExamForge may differ from Padvik): inspect
`package.json` (scripts + deps — look for `db:migrate`, `workers`, `tsx`, `drizzle-kit`),
check for `src/lib/queue/start-workers.ts`, `drizzle.config.ts`, `next.config.ts` (Serwist),
and whether an `/api/health` route exists (likely missing — you'll add it). If ExamForge has
no background-worker process, **skip the `worker` service** everywhere below.

---

## 1. GOTCHAS (the hard-won lessons — read before starting)

Ordered by how much pain they caused on Padvik.

### 1.1 GitHub push-to-deploy is NOT automatic — and the CLI can't enable it

The CLI connects the repo (initial deploy works) but **does not wire the push webhook**.
After the first deploy, `git push` does **nothing** until you, in the **Railway dashboard**:

1. Service → **Settings → Source**: connect repo + branch + **Root Directory** (`/` for a
   repo-root app).
2. **Enable the "Auto deploy" toggle** (it ships **disabled**).
3. **Apply any staged changes** (an "Apply N changes" banner means Branch/Config-File edits
   were staged but never applied — that was why Padvik's config never took effect).

The CLI token **lacks GitHub OAuth scopes**, so `railway service source connect` (App mode)
and any `githubRepos` query return `Unauthorized`. This step is **dashboard-only**. Until
it's wired, ship code with **`railway up --service web --ci`** (uploads the local working
tree, bypasses GitHub).

Also: `railway redeploy` reuses the **old build snapshot** (ignores new service settings,
skips `preDeployCommand`). `serviceInstanceDeployV2` (API) only rebuilds the **last-synced**
commit. A genuinely fresh build of latest code comes from a real **push (once webhook is
wired)** or **`railway up`**.

### 1.2 Do NOT force `builder: NIXPACKS` (Tailwind v4 breaks under it)

With Tailwind v4, forcing Nixpacks makes the build fail with
`@tailwindcss/oxide: Cannot find native binding`. **Omit the `build` section** in any
`railway.*.json` so Railway uses its **default builder (Railpack)**, which builds fine.
Config files should carry only the `deploy` section.

### 1.3 `tsx` / `drizzle-kit` / `dotenv` must be `dependencies`, not `devDependencies`

The worker runs in prod via `tsx` (`pnpm workers` → `tsx src/lib/queue/start-workers.ts`),
migrations run via `drizzle-kit`, and both worker + drizzle.config import `dotenv`. If they
sit in `devDependencies`, the prod image may prune them and the worker/migrate crash. Move
all three to `dependencies` and regenerate the lockfile (`pnpm install --lockfile-only`)
— Railway builds with `--frozen-lockfile`.

### 1.4 `drizzle/meta/` is usually gitignored — un-ignore it

`drizzle-kit migrate` needs `drizzle/meta/_journal.json` + snapshots to know which
migrations to apply. If gitignored, the clean Railway checkout has the `.sql` files but no
journal → **migrations silently don't run**. Remove `drizzle/meta/` from `.gitignore` and
commit the folder.

### 1.5 Config-as-code file paths may silently not apply; set start commands as service settings

On Padvik, the dashboard "Config File Path" (`railwayConfigFile`) stayed `null` because the
change sat **staged-but-unapplied** — so `railway.web.json`/`railway.worker.json` were
ignored and services fell back to `next start`. The reliable lever is the **start command
as a service setting** (Settings → Deploy → _Custom Start Command_, or API
`serviceInstanceUpdate`). If you DO use config files, also **apply** them in the dashboard
and verify `railwayConfigFile` is non-null.

### 1.6 Migrations: run them in the web START command (single instance)

`railway redeploy` skips `preDeployCommand`, and the config file carrying it may not apply.
The robust pattern for a **single web instance**: `startCommand = "pnpm db:migrate && pnpm
start"` (idempotent — a no-op when up to date). For **multiple web replicas**, move
migration to a one-off release job to avoid concurrent-migrate races.

### 1.7 The Postgres template's PRIVATE url is `DATABASE_URL` (not `DATABASE_PRIVATE_URL`)

Reference `DATABASE_URL = ${{Postgres.DATABASE_URL}}` (internal `*.railway.internal` host)
and `REDIS_URL = ${{Redis.REDIS_URL}}`. `DATABASE_PUBLIC_URL` / `REDIS_PUBLIC_URL` are the
internet-reachable proxies — use those (with `?sslmode=require`) only for running
migrations/seeds from your laptop. Do **not** use the DB's own `PGHOST` (often `0.0.0.0`).

### 1.8 NEXT_PUBLIC client-env footgun (dead-code elimination + hydration)

Do **not** gate **client-component** UI on a `process.env.NEXT_PUBLIC_*` flag that is only
set at **runtime**. `NEXT_PUBLIC_*` is inlined at **build**; if it isn't `"true"` at build
time, the bundler **dead-code-eliminates** the gated block from the client bundle. The
server still renders it at runtime (SSR shows it), then hydration removes it — the UI
**flashes and vanishes**. Fix: compute the flag in a **server component** (reads runtime
env, `export const dynamic = "force-dynamic"`) and pass it to the client component as a
**prop**. (This bit Padvik's demo-login buttons.)

### 1.9 PWA service worker serves stale assets after a deploy

Serwist precaches the build's chunks. After a deploy, a returning browser may serve the
**old** bundle until the SW updates. When verifying a UI change, **hard-refresh**
(Ctrl+Shift+R) or DevTools → Application → Service Workers → **Unregister** → reload. Don't
diagnose "it's not deployed" from a cached browser — verify with `curl` (no SW) too.

### 1.10 Never push auth-bypass / dev-only vars to prod

Exclude `SKIP_AUTH`, `NEXT_PUBLIC_SKIP_AUTH`, and any demo bypass from prod env. Demo
providers usually gate on `NODE_ENV === "development"`; to allow demo login in a prod MVP
test, gate on an explicit `ENABLE_DEMO_LOGIN` flag instead and **turn it off before
launch** (see §1.8 for the UI side).

### 1.11 A fresh DB renumbers IDENTITY sequences

If you seed (vs. copy the full DB), "well-known" ids differ — e.g. a system-creator user
that's id=6 locally becomes id=1 on a freshly-seeded prod. Any env var that references an
id (e.g. a `*_SYSTEM_CREATOR_ID`) must match the **actual** seeded id (the seed script
prints it). A full DB copy (§7b) preserves ids.

---

## 2. Repo prep (do this FIRST, then commit + push)

Run all of these in this repo, then `pnpm build` locally to confirm it compiles.

1. **Add a healthcheck route** `src/app/api/health/route.ts`:
   ```ts
   import { NextResponse } from "next/server";
   export const dynamic = "force-dynamic";
   export function GET() {
     return NextResponse.json({ success: true, data: { status: "ok" } });
   }
   ```
2. **Move runtime tools to `dependencies`** in `package.json`: `tsx`, `drizzle-kit`,
   `dotenv`. Then `pnpm install --lockfile-only`.
3. **Un-ignore migrations metadata**: remove `drizzle/meta/` from `.gitignore`;
   `git add drizzle/meta/`.
4. **(Optional) config-as-code** — create `railway.web.json` and `railway.worker.json`
   with **only a `deploy` section** (NO `build.builder`, per §1.2):
   ```jsonc
   // railway.web.json
   { "$schema": "https://railway.com/railway.schema.json",
     "deploy": { "startCommand": "pnpm db:migrate && pnpm start",
                 "healthcheckPath": "/api/health", "healthcheckTimeout": 120,
                 "restartPolicyType": "ON_FAILURE", "restartPolicyMaxRetries": 5 } }
   // railway.worker.json
   { "$schema": "https://railway.com/railway.schema.json",
     "deploy": { "startCommand": "pnpm workers",
                 "restartPolicyType": "ON_FAILURE", "restartPolicyMaxRetries": 10 } }
   ```
   (You will still set start commands as service settings in §6 because the file path may
   not apply — §1.5.)
5. **Gitignore secrets**: add `client_secret*.json`, `*googleusercontent.com.json`,
   `.railway-config-pull-*/`.
6. **Verify**: `pnpm build` → must exit 0. Then `git commit` + `git push`.

---

## 3. CLI setup & project provisioning

```bash
npm install -g @railway/cli          # then: railway --version
railway login --browserless          # prints a pairing URL — the USER opens it & approves
railway whoami                        # confirm session

# In this repo dir:
railway init --name examforge         # creates + links the project
railway add -d postgres               # add one at a time (combined -d flags can drop to
railway add -d redis                  # an interactive prompt and hang)
railway add --service web    --repo TalipotTech/ExamForgeApp --branch main
railway add --service worker --repo TalipotTech/ExamForgeApp --branch main   # skip if no workers
railway status                        # confirm: Postgres, Redis, web, worker
```

Notes: `railway add` may print a misleading `Unauthorized` yet still create the resource —
**verify with `railway status`** before retrying. Creating a service from `--repo`
auto-starts a build (which will be wrong until §6 — that's expected).

---

## 4. Environment variables

Transfer the real secrets from `.env.local` **via stdin** so values never hit argv/logs.
Override DB/Redis to private references; **drop** auth-bypass vars (§1.10).

```bash
# Per service, loop over .env.local and set each key via stdin:
while IFS='=' read -r k v; do
  case "$k" in ''|\#*|SKIP_AUTH|NEXT_PUBLIC_SKIP_AUTH|DATABASE_URL|REDIS_URL|NEXTAUTH_URL|NEXTAUTH_SECRET|AUTH_SECRET) continue;; esac
  v="${v%$'\r'}"; [ -z "$v" ] && continue
  printf '%s' "$v" | railway variable set "$k" --stdin --service web --skip-deploys
done < .env.local
# (repeat for --service worker)

# Private references + runtime settings (both services):
for s in web worker; do
  railway variable set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' --service "$s" --skip-deploys
  railway variable set 'REDIS_URL=${{Redis.REDIS_URL}}'           --service "$s" --skip-deploys
  railway variable set 'NODE_ENV=production'                       --service "$s" --skip-deploys
done

# web-only auth (NextAuth v5):
secret="$(openssl rand -base64 32)"
printf '%s' "$secret" | railway variable set AUTH_SECRET     --stdin --service web --skip-deploys
printf '%s' "$secret" | railway variable set NEXTAUTH_SECRET --stdin --service web --skip-deploys
railway variable set 'AUTH_TRUST_HOST=true' --service web --skip-deploys   # behind Railway proxy
```

Get the exact DB/Redis key names with `railway variables --service Postgres --kv | cut -d= -f1`.
Any **client-exposed** `NEXT_PUBLIC_*` must be set **before the build** (baked at build).

---

## 5. Generate the domain, then set auth URLs

```bash
railway domain --service web          # -> https://examforge-production-xxxx.up.railway.app
railway variable set 'NEXTAUTH_URL=https://<that-domain>' --service web --skip-deploys
railway variable set 'AUTH_URL=https://<that-domain>'     --service web --skip-deploys
```

If using Google OAuth, register the redirect URI in Google Cloud Console:
`https://<that-domain>/api/auth/callback/google`.

---

## 6. Start commands + healthcheck (service settings — the reliable lever)

Set per §1.5/§1.6. Easiest reliable path: dashboard → each service → Settings → Deploy →
**Custom Start Command**:

- **web**: `pnpm db:migrate && pnpm start` + Healthcheck Path `/api/health`
- **worker**: `pnpm workers`

Or via the API (CLI token works for this; see helper in §9):

```js
serviceInstanceUpdate(web, {
  startCommand: "pnpm db:migrate && pnpm start",
  healthcheckPath: "/api/health",
  healthcheckTimeout: 120,
  rootDirectory: "/",
});
serviceInstanceUpdate(worker, { startCommand: "pnpm workers", rootDirectory: "/" });
```

**Then trigger a genuinely new deployment** (`serviceInstanceDeployV2`, `railway up`, or a
push once §8 is wired) — a `railway redeploy` won't pick up new settings (§1.1).

---

## 7. Database: migrate, then seed or copy

### 7a. First-time migration (if not yet applied)

The web start command runs `pnpm db:migrate` on boot. To run it from your laptop against
the **public** URL:

```bash
PUB="$(railway variables --service Postgres --kv | sed -n 's/^DATABASE_PUBLIC_URL=//p')"
DATABASE_URL="${PUB}?sslmode=require" pnpm db:migrate     # dotenv won't override an already-set env var
```

Verify: connect with `psql "$PUB?sslmode=require"` and check `\dt` / row counts.

### 7b. Copy the FULL local DB to prod (if the user wants exact data)

```bash
LOCAL="$(sed -n 's/^DATABASE_URL=//p' .env.local)"
PUB="$(railway variables --service Postgres --kv | sed -n 's/^DATABASE_PUBLIC_URL=//p')"; PROD="${PUB}?sslmode=require"
pg_dump "$LOCAL" -Fc --no-owner --no-privileges -f /tmp/ef.dump
psql "$PROD" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;'
pg_restore --no-owner --no-privileges -d "$PROD" /tmp/ef.dump
# then compare row counts local vs prod; fix any id-referencing env vars (§1.11)
```

Use pg client tools whose version ≥ the **source** server (pg_dump 17 can't dump from an 18
server; restoring an older dump into a newer server is fine). Delete the dump after.

### 7c. Or run the seed scripts

`pnpm db:seed` etc., with `DATABASE_URL` exported to the `?sslmode=require` public URL. The
seeds use `dotenv` **without override**, so an already-set `DATABASE_URL` wins. After
seeding, set any `*_SYSTEM_CREATOR_ID`-style var to the id the seed actually printed (§1.11).

---

## 8. Wire GitHub push-to-deploy (dashboard — REQUIRED, see §1.1)

1. The repo owner grants the **Railway GitHub App** access to `TalipotTech/ExamForgeApp`
   (Railway dashboard → Service → Settings → Source → "Configure GitHub App", which links to
   GitHub).
2. Service → **Settings → Source**: confirm repo + **branch** + **Root Directory `/`**.
3. **Enable the "Auto deploy" toggle.**
4. If an **"Apply N changes"** banner is showing, open it and **Deploy Changes** (this is
   what actually persists Branch/Config-File settings — unapplied staging was Padvik's bug).
5. Repeat for **both** web and worker.
6. **Prove it**: push a trivial commit and confirm **both services auto-build the new
   commit** (check `railway status` / deployments). If nothing builds, auto-deploy isn't
   wired — recheck steps 1–4.

---

## 9. Helper: Railway GraphQL from the CLI token

When the CLI lacks a command (e.g. set start command, read/trigger deployments), call the
API with the stored token. `~/.railway/config.json` → `user.accessToken`.

```js
// rwapi.mjs — Bearer the CLI token against https://backboard.railway.app/graphql/v2
import fs from "node:fs";
const token = JSON.parse(fs.readFileSync(process.env.HOME + "/.railway/config.json", "utf8")).user
  .accessToken;
export async function gql(query, variables = {}) {
  const r = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}
```

Useful ops: `serviceInstanceUpdate(serviceId, environmentId, input)` (start cmd, healthcheck,
rootDirectory); `serviceInstanceDeployV2(serviceId, environmentId)` (rebuild last-synced
commit); `deployments(first, input:{serviceId, environmentId}){ edges{ node{ status meta } } }`
(read status + commit). NOTE: GitHub-scoped queries (`githubRepos`, source-connect) return
`Unauthorized` from the CLI token — those stay dashboard-only (§1.1). On Windows/Git-Bash,
`process.env.HOME` resolves to the user profile; if not, hardcode
`C:/Users/<you>/.railway/config.json`.

---

## 10. Verification checklist

- [ ] `pnpm build` passed locally before any push (don't burn Railway build cycles)
- [ ] All services Online; web + worker built from the latest commit (not a stale snapshot)
- [ ] web start log shows `db:migrate` → `migrations applied` → `next start`; `/api/health` → 200
- [ ] worker log shows your workers' "started" lines + `Redis connected` (private host)
- [ ] DB reachable on the private network (no SSL/auth errors); tables + row counts correct
- [ ] `DATABASE_URL`/`REDIS_URL` use the **private** refs; no auth-bypass vars in prod
- [ ] Any `NEXT_PUBLIC_*` value is correct in the **built** client bundle (grep a chunk)
- [ ] Full round-trip against prod: sign-up → login → an authed action (delete the test user)
- [ ] **Auto-deploy proven**: a fresh push auto-builds the services
- [ ] Client UI gated on runtime flags is **server-driven via props** (no DCE/hydration loss — §1.8)
- [ ] Hard-refresh the browser to clear the stale PWA service worker before judging UI (§1.9)

---

## 11. Failure → cause quick-reference

| Symptom                                                      | Likely cause                                             | Fix                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------- |
| Build fails `@tailwindcss/oxide: Cannot find native binding` | forced `builder: NIXPACKS`                               | drop `build` section → default Railpack (§1.2)        |
| Migrations never apply                                       | `drizzle/meta/` gitignored, or migrate not in start cmd  | un-ignore meta; put migrate in start cmd (§1.4/§1.6)  |
| Worker crashes "tsx: not found"                              | tsx in devDependencies, pruned in prod                   | move tsx/drizzle-kit/dotenv to deps (§1.3)            |
| Service runs `next start` not your command                   | config-file path didn't apply                            | set Custom Start Command (service setting) (§1.5)     |
| Push doesn't deploy                                          | auto-deploy disabled / staged-unapplied / App lacks repo | dashboard §8; or `railway up` meanwhile (§1.1)        |
| New settings ignored after deploy                            | `railway redeploy` reused old snapshot                   | trigger a NEW deploy (push / up / DeployV2) (§1.1)    |
| DB connect fails from laptop                                 | using private url or no SSL                              | use `DATABASE_PUBLIC_URL` + `?sslmode=require` (§1.7) |
| UI flag shows in HTML but not in browser                     | NEXT_PUBLIC DCE + hydration removal                      | server-compute + pass as prop (§1.8)                  |
| UI change "not deployed"                                     | stale PWA service worker                                 | hard-refresh / unregister SW (§1.9)                   |

---

_Distilled from the Padvik Railway deploy (Next.js 15 + Postgres + Redis + BullMQ workers +
Auth.js + Serwist PWA). The §1 gotchas are stack-level and apply to ExamForge as-is; confirm
§0/§2 specifics against this repo's `package.json` before executing._
