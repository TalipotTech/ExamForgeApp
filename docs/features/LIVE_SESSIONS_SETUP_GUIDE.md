# Live Sessions — Setup & Operations Guide

**Audience:** ExamForge engineers + ops setting up the Live Sessions feature in dev / staging / prod.
**Scope:** All three meeting providers (manual URL, Zoom OAuth, embedded 100ms), the env vars they need, the dashboard configuration on each provider, the test flow that proves each one works, and the known footguns.

This is the **operational** companion to the design docs:

- `LIVE_SESSIONS_OPTION_B_ZOOM.md` — Zoom design rationale
- `LIVE_SESSIONS_OPTION_C_EMBEDDED.md` — embedded video design rationale

If you're choosing **which** option to ship, read those. If you're **wiring up** an option that already shipped, read this.

---

## TL;DR — what each option needs

| Option                     | Provider setup                      | Per-creator setup                                      | App env vars | Webhook needed           |
| -------------------------- | ----------------------------------- | ------------------------------------------------------ | ------------ | ------------------------ |
| **A — Paste URL (manual)** | None                                | None                                                   | None         | No                       |
| **B — Zoom OAuth**         | Marketplace app (one-time)          | OAuth connect at `/creator/integrations` (per creator) | 5 vars       | Yes (recordings)         |
| **C — Embedded (100ms)**   | App + template + webhook (one-time) | None                                                   | 6 vars       | Yes (state + recordings) |

All three coexist. The schedule form at `/creator/live-sessions/new` shows up to three radios; each appears only when its prerequisite is satisfied.

---

## Common to all three

### 1. Database migration

```bash
pnpm db:migrate
```

This applies migrations 0024 (`live_sessions.meeting_provider`, `creator_zoom_integrations`) and 0025 (`live_sessions.provider_room_id`, `provider_template_id`). Both are idempotent (`IF NOT EXISTS`) and safe to re-run.

### 2. Feature flags

The whole feature is double-gated. Both must be `true` in `admin_feature_flags`:

| Key                              | Required value |
| -------------------------------- | -------------- |
| `creators.enabled`               | `true`         |
| `creators.live_sessions_enabled` | `true`         |

Flip them via `/admin/settings` (or directly):

```sql
UPDATE admin_feature_flags SET value = 'true' WHERE key IN ('creators.enabled', 'creators.live_sessions_enabled');
```

If either is off, every `liveSession.*` tRPC call returns `FORBIDDEN: FEATURE_DISABLED:...` and the UI shows "Live sessions are not yet enabled."

### 3. Routes the user hits

| Role    | Route                         | Purpose                        |
| ------- | ----------------------------- | ------------------------------ |
| Creator | `/creator/live-sessions`      | List + cancel                  |
| Creator | `/creator/live-sessions/new`  | Schedule (3-way radio)         |
| Creator | `/creator/live-sessions/[id]` | Detail + attendees + recording |
| Creator | `/creator/integrations`       | Connect/disconnect Zoom        |
| Student | `/dashboard/live`             | Upcoming + History             |
| Student | `/dashboard/live/[id]/room`   | Embedded room (Option C only)  |

### 4. Webhooks land at

| Provider | Path                      |
| -------- | ------------------------- |
| Zoom     | `POST /api/webhooks/zoom` |
| 100ms    | `POST /api/webhooks/hms`  |

In dev these need to be exposed via ngrok (see [§ Local dev: ngrok tunnel](#local-dev-ngrok-tunnel)).

### 5. Per-session timing rules

| Behavior                                        | Rule                                                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Join button enabled (student)                   | 5 min before `scheduled_at`                                                                                                      |
| Status auto-flip `scheduled` → `live`           | First peer joins (manual: `markJoined`; Zoom: webhook `meeting.started`; 100ms: `getJoinToken` + webhook `room.session.started`) |
| Status auto-flip `live` / `scheduled` → `ended` | `scheduled_at + duration + 30 min` grace, lazy-reaped on next list/byId call                                                     |
| Visible in History                              | After auto-end                                                                                                                   |

If you need to test the full flow without waiting, schedule **at least 2 hours out** so the reaper doesn't auto-end the session mid-test.

---

## Option A — Paste your own URL

### App config

None.

### Provider config

None.

### How a creator uses it

1. Create a meeting in Google Meet / Zoom / Teams **outside ExamForge**, copy the join URL.
2. Visit `/creator/live-sessions/new`.
3. Pick **"Paste my own URL"** (this is the always-default fallback).
4. Paste the URL into **Meeting URL**, fill the other fields, **Schedule**.

### How a student uses it

1. Visit `/dashboard/live`. Session appears under **Upcoming** if scheduled, with no provider badge.
2. Click **Join** within the join window → opens the URL in a new tab.

### Limitations

- No auto-recording — creator must manually paste the recording link in the detail page after the meeting.
- No automatic state transitions — relies on the time-based reaper to flip to `ended`.
- No platform analytics inside the meeting (we only know the student clicked Join).

---

## Option B — Zoom OAuth + auto-create

### Operator: one-time Zoom Marketplace app

1. Go to [https://marketplace.zoom.us/develop/create](https://marketplace.zoom.us/develop/create).
2. Sign in with the Zoom account that should appear as the app's publisher.
3. Click **Develop → Build App → General App**.
4. Name it (e.g. `ExamForge`), select **User-managed** (each creator authorizes their own account).
5. **App Credentials tab:**
   - Copy `Client ID` → goes into `ZOOM_CLIENT_ID`.
   - Reveal + copy `Client Secret` → `ZOOM_CLIENT_SECRET`.
   - **OAuth Redirect URL** AND **OAuth Allow List** — both add:
     - dev: `http://localhost:3100/api/integrations/zoom/callback`
     - prod: `https://<your-domain>/api/integrations/zoom/callback`
6. **Scopes tab — add exactly these four:**
   - `meeting:write:user` — create meetings
   - `meeting:read:user` — fetch meeting details
   - `recording:read:user` — fetch recording URLs
   - `user:read:user` — read connected user's email + plan tier
7. **Features → Event Subscriptions:**
   - Toggle **on**.
   - Copy **Secret Token** → `ZOOM_WEBHOOK_SECRET_TOKEN`.
   - **Event notification endpoint URL:** `https://<your-public-host>/api/webhooks/zoom`
     (use ngrok in dev — see § Local dev).
   - Click **Validate** — should turn green (the route handles `endpoint.url_validation` automatically).
   - **Add Event Subscription** → tick:
     - `Recording → All Recordings have completed`
     - `Meeting → Meeting has started`
     - `Meeting → Meeting has ended`
   - **Save**.
8. **Activation tab → Add the app** to your own Zoom account, otherwise OAuth fails for the publisher's own account.

### App env vars

Add to `.env.local`:

```bash
ZOOM_CLIENT_ID=<from App Credentials>
ZOOM_CLIENT_SECRET=<from App Credentials>
ZOOM_REDIRECT_URI=http://localhost:3100/api/integrations/zoom/callback
ZOOM_WEBHOOK_SECRET_TOKEN=<from Event Subscriptions>
ZOOM_TOKEN_ENCRYPTION_KEY=<see below — DO NOT skip>
```

Generate the encryption key (32 random bytes, base64) — **NOT from Zoom**, this is local-only and encrypts OAuth tokens at rest:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# or in PowerShell:
[Convert]::ToBase64String((1..32 | %{ [byte](Get-Random -Max 256) }))
# or with openssl:
openssl rand -base64 32
```

⚠️ **Don't change `ZOOM_TOKEN_ENCRYPTION_KEY` after creators have connected** — every connected `creator_zoom_integrations` row becomes undecryptable and creators must reconnect. Store the prod key in **AWS Secrets Manager**, never in `.env`.

Restart `pnpm dev` — Next.js doesn't hot-reload env vars.

### Per-creator setup

1. Creator opens `/creator/integrations`. The Zoom card shows "Not connected" + a **Connect Zoom** button.
2. Click **Connect Zoom** → redirected to `https://zoom.us/oauth/authorize?...`.
3. Sign in to Zoom, approve the four scopes.
4. Zoom redirects back to `/api/integrations/zoom/callback?code=...`.
5. The route exchanges the code, fetches the creator's Zoom email + plan tier, encrypts both tokens, upserts `creator_zoom_integrations` row.
6. Creator lands at `/creator/integrations?connected=zoom`. Card now shows ● Connected, the email, the plan tier (basic / pro / business), and Reconnect / Disconnect buttons.

### How a creator schedules

1. `/creator/live-sessions/new` — the **Auto-create with Zoom** radio is now visible AND defaulted on.
2. Optional: toggle **Auto-record to cloud** (requires Zoom Pro), **Mute participants on entry**, **Waiting room**.
3. Submit. The mutation:
   - Refreshes the access token if needed (60s pre-expiry slack).
   - Calls `POST /v2/users/me/meetings` on Zoom.
   - Stores `meeting_provider='zoom'`, `meeting_url=<join_url>`, `meeting_id=<zoom meeting id>`.
4. Session appears in upcoming with the blue **Zoom** badge.

### Recording auto-attach (the killer feature)

1. Creator runs the meeting, ends it.
2. Zoom processes the recording (5–60 min) and POSTs `recording.completed` to the webhook.
3. The route HMAC-verifies (`x-zm-signature: v0=HMAC-SHA256(v0:<ts>:<body>, ZOOM_WEBHOOK_SECRET_TOKEN)`) + rejects timestamps > 5 min old.
4. Updates `live_sessions.recording_url` + `is_recorded=true` matched by `meeting_id`.
5. Detail page + History card auto-show the recording link on next refresh.

### Common Zoom pitfalls

| Symptom                                     | Cause                                                                              | Fix                                                                                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook **Validate** fails                  | Wrong path, ngrok not running, old endpoint URL                                    | URL must be `<public>/api/webhooks/zoom`. Test: `curl -X POST <public>/api/webhooks/zoom -H 'Content-Type: application/json' -d '{}'` should return JSON, not HTML. |
| OAuth callback → "zoom_not_configured"      | Env var missing in the running Node process                                        | Restart `pnpm dev` after editing `.env.local`.                                                                                                                      |
| OAuth callback → "not_a_creator"            | Signed-in user doesn't have a `creator_profiles` row                               | They need to register as a creator first.                                                                                                                           |
| `Cloud recording requires Zoom Pro` warning | Account is Basic                                                                   | Upgrade Zoom to Pro, or fall back to manual recording upload.                                                                                                       |
| Recording never appears                     | Webhook URL changed (ngrok restart), or `recording.completed` event not subscribed | Re-validate webhook URL in marketplace dashboard.                                                                                                                   |
| Creator's token expired (60-day inactivity) | Zoom invalidates refresh tokens after 60 days of disuse                            | Creator hits Disconnect + Connect Zoom again.                                                                                                                       |

---

## Option C — Embedded video via 100ms

### Operator: one-time 100ms account + app

1. Sign up at [https://dashboard.100ms.live](https://dashboard.100ms.live).
2. **Create an App** (default workspace is fine for dev).
3. **Templates tab** → create a new template (or edit the default one). Roles must be named **exactly** `creator` and `student` — the app issues tokens with these role names; mismatched names cause silent join failures.
   - **`creator` role:**
     - Publish: ✓ Audio, ✓ Video, ✓ Screen
     - Subscribe: all
     - Permissions: ✓ Mute others, ✓ Remove others, ✓ End room, ✓ Recording
   - **`student` role:**
     - Publish: ✓ Audio, ✓ Video (host approval not required for MVP)
     - Subscribe: creator + student
     - Permissions: ✓ Chat (recommended)
   - **Default role for new joiners:** `student`.
   - Region: `in` (India) for the lowest latency on Indian audiences.
   - **Save** — copy the **Template ID**.
4. **Settings → Recording** (within the template):
   - Enable cloud recording.
   - Optionally: separate output template if you want recording-only sessions on a different template.
5. **Developer tab → App Credentials:**
   - Copy **App Access Key** → `HMS_APP_ACCESS_KEY`.
   - Copy **App Secret** → `HMS_APP_SECRET`.
6. **Developer tab → Configure Webhook:**
   - Toggle **Enabled**.
   - **Webhook URL:** `https://<public>/api/webhooks/hms` (ngrok in dev).
   - **Add a custom Webhook Header** — both fields exactly:
     - Name: `x-100ms-webhook-passcode`
     - Value: pick any random string (this is your shared secret) → `HMS_WEBHOOK_PASSCODE`
   - Click **Test Webhook** — should return 200 (or 400 with "no_event_or_room" — that's also "auth passed, payload was empty", expected for the test).

Generate the passcode value:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

### App env vars

Add to `.env.local`:

```bash
HMS_APP_ACCESS_KEY=<App Credentials>
HMS_APP_SECRET=<App Credentials>
HMS_TEMPLATE_ID=<Template ID from Templates tab>
HMS_RECORDING_TEMPLATE_ID=          # optional; if set + creator opts in, sessions use this template
HMS_WEBHOOK_PASSCODE=<the value you set as the custom header>
HMS_API_BASE=https://api.100ms.live/v2
```

Restart `pnpm dev`.

### Per-creator setup

None — the embedded radio appears for all creators when `HMS_APP_ACCESS_KEY` is set.

### How a creator schedules

1. `/creator/live-sessions/new` — **Embedded HD video** radio appears + defaults on (unless they have Zoom connected, in which case Zoom defaults).
2. Toggle **Enable recording** / **Enable chat**, set **Max attendees**.
3. Submit. The mutation:
   - Calls `POST /v2/rooms` on 100ms with the template id (or `HMS_RECORDING_TEMPLATE_ID` if recording opted in + that env is set).
   - Stores `meeting_provider='100ms'`, `provider_room_id=<100ms room id>`, `meeting_url=/dashboard/live/[id]/room` (in-app path).
4. Session appears with the purple **Embedded** badge.

### How a student joins

1. `/dashboard/live` → click **Join** on a 100ms session within the join window.
2. Router pushes to `/dashboard/live/[id]/room` (in-app — no new tab).
3. The room calls `liveSession.getJoinToken` mutation:
   - Verifies access scope (host, classroom member, or standalone session).
   - Verifies session is `100ms` provider, not ended/cancelled, and within the 5-min pre-start window for non-hosts.
   - Issues a 24h JWT scoped to `(roomId, userId, role)`.
   - Auto-`markJoined`: inserts attendee row + flips status `scheduled` → `live`.
4. The room calls `hmsActions.join({ authToken, settings })`:
   - **Hosts** join with mic + camera on (so they can speak immediately).
   - **Students** join muted (so the SDK doesn't try to acquire devices the user may not have / hasn't permitted). They unmute via the mic/camera buttons, which triggers the browser permission prompt at that exact moment.
5. Peer grid renders. Mic / camera toggles + Leave button. Hard-leaves on unmount; flushes `watchSeconds` to `markLeft`.

### Recording auto-attach

1. Meeting ends → 100ms finalizes recording.
2. 100ms POSTs `beam.recording.success` to the webhook with `recording_path` / `recording_presigned_url`.
3. The route checks the `x-100ms-webhook-passcode` header against `HMS_WEBHOOK_PASSCODE`.
4. Updates `live_sessions.recording_url` + `is_recorded=true` + `total_watch_minutes` matched by `provider_room_id`.

### Common 100ms pitfalls

| Symptom                                                  | Cause                                                     | Fix                                                                                                                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `received error from sdk { code: 3002 }`                 | No camera/mic, or browser permission denied               | Already handled — students join muted by default; first benign error shows a "listen-only mode" toast. Real users don't see the dev overlay (production-only suppression isn't needed). |
| Join silently fails (no peers, no errors in Network tab) | Role name in token doesn't match role names in template   | Template **must** have roles named exactly `creator` and `student`. Check Templates tab → role list.                                                                                    |
| Webhook **Test Webhook** returns 502                     | ngrok forwarding to wrong port, or `pnpm dev` not running | `pnpm dev` must be on **3100**, ngrok command: `ngrok http 3100`.                                                                                                                       |
| Webhook returns 401 `bad_passcode`                       | Custom header missing or value mismatched                 | Verify name = `x-100ms-webhook-passcode`, value matches `HMS_WEBHOOK_PASSCODE` in `.env.local` exactly.                                                                                 |
| Recording never appears                                  | Webhook URL changed (ngrok restart), event not subscribed | Update Webhook URL in dashboard; recording event is implicit (all webhooks fire).                                                                                                       |
| Camera blocked icon in URL bar                           | Browser cached "Block" decision for `localhost:3100`      | Click the lock icon → reset Camera + Microphone to **Allow** → reload.                                                                                                                  |

---

## Local dev: ngrok tunnel

Both Zoom and 100ms webhooks need a public HTTPS URL. `localhost` won't work.

### One-time

```bash
winget install ngrok.ngrok          # or: choco install ngrok
ngrok config add-authtoken <token from https://dashboard.ngrok.com/get-started/your-authtoken>
```

### Each session

```bash
ngrok http 3100
```

Output:

```
Forwarding   https://<random>.ngrok-free.app -> http://localhost:3100
```

Use that URL for webhook endpoints. **Free-tier URLs change every restart.** Either:

- Update both Zoom + 100ms webhook URLs after each restart, OR
- Reserve a **fixed domain** at [https://dashboard.ngrok.com/cloud-edge/domains](https://dashboard.ngrok.com/cloud-edge/domains) (free plan allows one), then run `ngrok http --url=<your-name>.ngrok-free.app 3100`.

In production, the webhook endpoints are just `https://<your-domain>/api/webhooks/{zoom,hms}` — no tunnel needed.

---

## End-to-end smoke test

After setup, run these for each option you've enabled. Schedule sessions at least 2 hours in the future to avoid the auto-end reaper.

### Option A — paste URL

1. Disconnect Zoom (if connected) and unset `HMS_APP_ACCESS_KEY` to verify A is the only option.
2. Schedule a session with `https://meet.google.com/...`.
3. Sign in as a different user (student). `/dashboard/live` shows the session under Upcoming. Click **Join** → opens in new tab.

### Option B — Zoom

1. `/creator/integrations` → **Connect Zoom** → approve → card shows ● Connected.
2. Schedule with **Auto-create with Zoom**. Confirm row in DB has `meeting_provider='zoom'` + `meeting_id` populated.
3. Open meeting from the list — Zoom URL launches.
4. Run a real Zoom meeting briefly with cloud recording. End. Wait 5–60 min. Recording link auto-appears on the History card via webhook.
5. Webhook test (no real meeting needed): in the Zoom marketplace dashboard, click **Validate** on the webhook URL — should turn green.

### Option C — embedded

1. Schedule with **Embedded HD video** + recording on.
2. Confirm DB row: `meeting_provider='100ms'`, `provider_room_id` populated, `meeting_url=/dashboard/live/<id>/room`.
3. Click **Join** as the creator → in-app room loads, host badge shows, mic + camera both ON.
4. In a different browser (or incognito), sign in as a student, click **Join** → in-app room loads, mic + camera both OFF (correct), peer grid shows both peers.
5. Click student's mic/camera → browser permission prompt → on Allow, peer's avatar swaps to live video.
6. Click **Leave** → returns to `/dashboard/live`. Status flips to `ended` either via 100ms webhook or the time-based reaper.
7. End meeting in 100ms (or wait for reaper) → recording appears on History card via `beam.recording.success` webhook.

---

## Production deployment

### Secrets management

Move all of these from `.env.local` to **AWS Secrets Manager** (per `CLAUDE.md`):

```
ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_WEBHOOK_SECRET_TOKEN, ZOOM_TOKEN_ENCRYPTION_KEY
HMS_APP_ACCESS_KEY, HMS_APP_SECRET, HMS_WEBHOOK_PASSCODE
```

Pull at App Runner startup. **Never** commit a real `.env` file.

### Webhook URLs in marketplaces

Update the dashboards:

| Provider         | Where                                       | Update to                                                                                            |
| ---------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Zoom Marketplace | App → Features → Event Subscriptions        | `https://ice.ensate.in/api/webhooks/zoom`                                                            |
| Zoom Marketplace | App → App Credentials → OAuth               | `https://ice.ensate.in/api/integrations/zoom/callback` (in BOTH the Redirect URL AND the Allow List) |
| 100ms Dashboard  | Developer → Configure Webhook → Webhook URL | `https://ice.ensate.in/api/webhooks/hms`                                                             |

Replace `ice.ensate.in` with the actual production hostname.

### App URL env

```
APP_URL=https://ice.ensate.in
```

The Zoom callback uses this for the back-redirect after OAuth.

### Submit Zoom app for marketplace publication (optional)

If you want creators outside your test users to OAuth-connect, the marketplace app needs to be **submitted for review** at Zoom's marketplace. Until then, only users you explicitly add to the app's Test Accounts can authorize. Internal-only is fine for closed beta.

### Minimum prod test

1. Create a sandbox test creator + test student in the prod DB.
2. Connect Zoom (use a real Zoom Pro account, not the dev one).
3. Schedule one of each type, verify webhook deliveries land at the prod URLs.
4. Confirm `live_sessions.recording_url` populates after a real meeting.

---

## Operational FAQ

**Q: A session is missing from a student's Upcoming list but visible in the creator's list. Why?**

A: One of three causes:

1. The session has `classroom_id` set and the student isn't a member of that classroom. Either set `classroom_id = NULL` or add the student to the classroom.
2. The session's auto-end window has passed; it should be in History instead. Refresh.
3. (Should be fixed) Timezone mismatch in DB-side date comparisons. We use `(now() AT TIME ZONE 'UTC')` in queries to avoid this — if you see it again, file a bug.

**Q: A session is in neither Upcoming nor History but the row exists in DB.**

A: Same as #3 above — either the row's `classroom_id` excludes the student, or there's a timezone gap. Check the row's `status` and `scheduled_at + duration + 30 min` vs `NOW()` directly.

**Q: How do I reset a session for re-testing?**

```sql
UPDATE live_sessions
SET status = 'scheduled',
    scheduled_at = NOW() + INTERVAL '2 hours',
    started_at = NULL,
    ended_at = NULL,
    recording_url = NULL,
    is_recorded = false,
    total_watch_minutes = 0
WHERE id = '<session-uuid>';
DELETE FROM live_session_attendees WHERE session_id = '<session-uuid>';
```

**Q: How do I disconnect a creator's Zoom without them logging in?**

```sql
DELETE FROM creator_zoom_integrations WHERE creator_id = '<creator-profile-id>';
```

The next time they visit `/creator/integrations`, the card flips to "Not connected".

**Q: How do I rotate `ZOOM_TOKEN_ENCRYPTION_KEY`?**

Don't, unless you accept that all currently-connected creators need to reconnect. If you must:

1. `TRUNCATE creator_zoom_integrations;`
2. Update the env var.
3. Email creators asking them to reconnect.

**Q: A student has no camera/mic — does the embedded room still work for them?**

Yes — they join muted, see the host's video, hear the host's audio, can see the chat (when implemented). The mic/camera buttons stay red until they have a device + grant permission.

**Q: Webhook delivery missed. How do I backfill?**

- Zoom: there's no marketplace UI to replay. Either re-run a short test meeting, or paste the recording URL manually on the detail page.
- 100ms: same — no replay UI. Manual paste.

A daily cron that polls each provider's recording API for sessions in `ended` status without `recording_url` is a sensible follow-up but isn't shipped.

---

## Files & code locations

| Concern                   | Path                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| DB schema                 | `packages/shared/src/db/schema/live-sessions.ts`, `creator-zoom-integrations.ts`, `live-session-attendees.ts` |
| Migrations                | `packages/shared/drizzle/0024_low_squadron_supreme.sql`, `0025_nice_sister_grimm.sql`                         |
| Validators                | `packages/shared/src/validators/live-session.ts`, `zoom-integration.ts`                                       |
| Live-session router       | `apps/api/src/trpc/routers/live-session.ts`                                                                   |
| Zoom router               | `apps/api/src/trpc/routers/zoom-integration.ts`                                                               |
| Zoom REST client          | `apps/api/src/services/zoom-client.ts`                                                                        |
| Zoom token crypto (API)   | `apps/api/src/services/token-crypto.ts`                                                                       |
| Zoom token crypto (web)   | `apps/web/src/lib/zoom-token-crypto.ts`                                                                       |
| 100ms REST client         | `apps/api/src/services/hms-client.ts`                                                                         |
| 100ms token signer        | `apps/api/src/services/hms-token.ts`                                                                          |
| Zoom OAuth callback       | `apps/web/src/app/api/integrations/zoom/callback/route.ts`                                                    |
| Zoom webhook              | `apps/web/src/app/api/webhooks/zoom/route.ts`                                                                 |
| 100ms webhook             | `apps/web/src/app/api/webhooks/hms/route.ts`                                                                  |
| Creator schedule form     | `apps/web/src/app/creator/live-sessions/new/page.tsx`                                                         |
| Creator integrations page | `apps/web/src/app/creator/integrations/page.tsx`                                                              |
| Embedded room page        | `apps/web/src/app/(dashboard)/dashboard/live/[id]/room/page.tsx` + `HMSRoom.tsx`                              |
| Student card / list       | `apps/web/src/components/classroom/classroom-live-sessions.tsx`                                               |

---

## Changelog

| Date       | Change                                                                |
| ---------- | --------------------------------------------------------------------- |
| 2026-05-08 | Initial guide — covers all three options after end-to-end smoke test. |
