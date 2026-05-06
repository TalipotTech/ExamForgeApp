# Live Sessions — Option B: Zoom OAuth + Zoom API

**Status:** Design doc — not yet implemented.
**Prereq:** Option A (Google Meet URL paste) is shipped on `feat/live-sessions`.
**Build estimate:** 1–2 focused days.
**Cost:** Zoom Pro/Business per host creator (₹1,500–₹2,500/mo each). Webhooks free.

## When to choose this over A or C

- Pick **B** when creators already pay for Zoom Pro and want auto-recording + cleaner UX than paste-a-URL.
- Don't pick B if you want India-cheap per-minute or fully-embedded — go to C.
- Pick B over C when you don't want recurring per-participant cost on the platform's books.

## End-to-end wireframes (text)

### 1. Creator one-time OAuth connect

```
┌──────────────────────────────────────────────────────────┐
│  /creator/integrations                                   │
│  ─────────────────────────────────────                   │
│  Meeting providers                                       │
│                                                          │
│  ┌─────────────────────────────────────────┐             │
│  │ [Z] Zoom                                │             │
│  │ Auto-create meetings + auto-record.     │             │
│  │                                         │             │
│  │ ○ Not connected     [ Connect Zoom ]    │             │
│  └─────────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────┘

Click Connect Zoom →
   redirect to https://zoom.us/oauth/authorize?... →
   user signs in to Zoom, approves scopes →
   Zoom redirects to /api/integrations/zoom/callback?code=... →
   we exchange code for access_token + refresh_token →
   store encrypted in creator_zoom_integrations →
   redirect back to /creator/integrations?connected=zoom

After connect:
┌─────────────────────────────────────────┐
│ [Z] Zoom                                │
│ ● Connected as instructor@example.com   │
│ Account: Pro (recording enabled)        │
│        [ Refresh ]  [ Disconnect ]      │
└─────────────────────────────────────────┘
```

### 2. Creator schedule (new "Meeting source" toggle on existing form)

```
┌──────────────────────────────────────────────────────────┐
│  /creator/live-sessions/new                              │
│  ─────────────────────────────────────                   │
│                                                          │
│  Title         [_____________________________]           │
│  Description   [_____________________________]           │
│  Starts at     [_______]    Duration [60] min            │
│                                                          │
│  Meeting source                                          │
│  ⊙ Auto-create with Zoom (recommended)                   │
│      ✓ Recording auto-uploaded to your Zoom              │
│      ✓ URL emailed to attendees automatically            │
│  ○ Paste my own URL (Meet, Teams, Zoom personal link)    │
│                                                          │
│  [If Auto-create selected]                               │
│   ↳ Settings:                                            │
│     ☑ Auto-record to cloud                               │
│     ☑ Mute participants on entry                         │
│     ☑ Waiting room                                       │
│     Passcode: [auto-generated]                           │
│                                                          │
│  [If Paste URL selected]                                 │
│   ↳ Meeting URL [_____________________________]          │
│                                                          │
│  Classroom (optional)  [No classroom — open to all  ▼]   │
│                                                          │
│  ☑ Free for all                                          │
│                                                          │
│                              [ Cancel ] [ Schedule ]     │
└──────────────────────────────────────────────────────────┘
```

On submit with Zoom:

- API call: `POST /users/me/meetings` with title, scheduled_at, duration, settings
- Zoom returns `{ id, join_url, password, settings }`
- We store `meeting_url`, `meeting_id`, `meeting_provider='zoom'`
- If creator's token expired, refresh first; if refresh fails, fall back to "Paste URL" mode with a warning.

### 3. Student join (unchanged)

Same as Option A — click Join → opens `meeting_url` in a new tab. Zoom URL contains the password embedded so no friction.

### 4. Recording auto-attach (the killer feature)

```
[Zoom] meeting ends
   ↓
[Zoom] processes recording (5–60 min later)
   ↓
[Zoom] POST → https://your-domain/api/webhooks/zoom
   {
     "event": "recording.completed",
     "payload": {
       "object": {
         "id": "<meeting_id>",
         "recording_files": [
           { "play_url": "...", "recording_type": "shared_screen_with_speaker_view" }
         ]
       }
     }
   }
   ↓
[ExamForge] verify HMAC signature with ZOOM_WEBHOOK_SECRET_TOKEN
   ↓
[ExamForge] UPDATE live_sessions
   SET recording_url = <play_url>, is_recorded = true
   WHERE meeting_id = <zoom meeting id>
   ↓
Student sees "Watch recording" button on History card automatically.
```

## Schema additions (new migration 002X)

```ts
// packages/shared/src/db/schema/creator-zoom-integrations.ts
export const creatorZoomIntegrations = pgTable(
  "creator_zoom_integrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),

    zoomUserId: varchar("zoom_user_id", { length: 50 }).notNull(),
    zoomAccountEmail: varchar("zoom_account_email", { length: 255 }),
    zoomAccountType: varchar("zoom_account_type", { length: 20 }), // 'basic' | 'pro' | 'business'

    // Tokens — encrypt at rest with AWS KMS or similar; never store raw.
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    scopes: text("scopes").notNull(), // space-separated

    connectedAt: timestamp("connected_at").defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at"),
  },
  (t) => [
    unique("creator_zoom_unique").on(t.creatorId), // one connection per creator
    index("creator_zoom_user_idx").on(t.zoomUserId),
  ],
);
```

Add to `liveSessions`:

```ts
meetingProvider: varchar("meeting_provider", { length: 20 }).default("manual"), // 'manual' | 'zoom'
```

## tRPC router additions

```ts
// apps/api/src/trpc/routers/zoom-integration.ts (new)
zoomIntegration: {
  startConnect: protectedProcedure.mutation(); // returns { authUrl }
  status: protectedProcedure.query(); // returns { connected, accountEmail, accountType }
  disconnect: protectedProcedure.mutation();
}

// liveSession router extension
liveSession: {
  scheduleViaZoom: protectedProcedure.input(scheduleZoomSchema).mutation();
  // ↳ same input as schedule but no meetingUrl; we generate it
}
```

## OAuth callback + webhook routes (Next.js handlers, not tRPC)

```
apps/web/src/app/api/integrations/zoom/callback/route.ts
  - Receives ?code=... after user approves
  - Calls Zoom token endpoint with client_id/secret/code
  - Encrypts tokens, INSERT/UPSERT into creator_zoom_integrations
  - Redirects back to /creator/integrations?connected=zoom

apps/web/src/app/api/webhooks/zoom/route.ts
  - POST handler
  - Verify HMAC: x-zm-signature header == HMAC-SHA256(payload, ZOOM_WEBHOOK_SECRET_TOKEN)
  - Handle 'endpoint.url_validation' challenge for initial Zoom verification
  - Handle 'recording.completed' → update live_sessions.recording_url
  - Handle 'meeting.started' → update live_sessions.status='live'
  - Handle 'meeting.ended' → update live_sessions.status='ended', ended_at
```

## New env vars (add to `.env.example`)

```
# Zoom — Marketplace App (User-managed OAuth)
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_REDIRECT_URI=https://localhost:3100/api/integrations/zoom/callback
ZOOM_WEBHOOK_SECRET_TOKEN=
ZOOM_WEBHOOK_VERIFICATION_TOKEN=

# Token encryption — KMS-backed in prod, generated locally for dev
ZOOM_TOKEN_ENCRYPTION_KEY=  # 32-byte base64; use AWS KMS for prod
```

## Operator setup (one-time, before code ships)

1. Create a Zoom Marketplace App: https://marketplace.zoom.us/develop/create
2. Choose **OAuth** app type, **User-managed** (each creator authorizes their own account).
3. Scopes needed:
   - `meeting:write:user` — create meetings
   - `meeting:read:user` — fetch meeting details
   - `recording:read:user` — get recording URLs
   - `user:read:user` — fetch creator's email/account info
4. Set Redirect URL: `https://your-prod-domain/api/integrations/zoom/callback`
5. Subscribe to webhook events: `recording.completed`, `meeting.started`, `meeting.ended`.
6. Set webhook URL: `https://your-prod-domain/api/webhooks/zoom`
7. Copy Client ID, Client Secret, Webhook Secret Token into prod secrets (AWS Secrets Manager).

## Cost model

- Zoom: free for creator (creator pays Zoom directly for Pro). ExamForge pays $0.
- Per session: 0 platform cost.
- One-time engineering: ~12 focused hours.

## Risks + mitigations

| Risk                                         | Mitigation                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| Token leak — full meeting + recording access | KMS-encrypt at rest; never log; rotate `ZOOM_TOKEN_ENCRYPTION_KEY` periodically |
| Refresh token expires (60-day inactivity)    | Cron job: ping Zoom API monthly per creator to keep tokens warm                 |
| Webhook replay attacks                       | Verify HMAC + check timestamp ≤ 5min old                                        |
| Creator on Basic plan can't auto-record      | UI shows "Recording requires Zoom Pro" warning; falls back to manual upload     |
| Zoom outage                                  | Schedule UI auto-falls-back to "Paste URL" mode                                 |
| Recording webhook lost                       | Daily cron polls Zoom API for sessions in `ended` status without recording_url  |

## Migration path from current Option A

- Existing sessions with `meeting_provider IS NULL` → treat as `'manual'`
- New sessions get `'manual'` or `'zoom'`
- Schedule form gets the new toggle; default = whichever the creator has connected (or `manual` if none)
- No breaking changes — Option A (paste URL) stays available forever as the fallback

## Files to create/modify

```
NEW
  packages/shared/src/db/schema/creator-zoom-integrations.ts
  packages/shared/drizzle/002X_zoom_integrations.sql        # via pnpm db:generate
  packages/shared/src/validators/zoom-integration.ts
  apps/api/src/trpc/routers/zoom-integration.ts
  apps/api/src/services/zoom-client.ts                     # API wrapper + token refresh
  apps/api/src/services/token-crypto.ts                    # AES-256-GCM helper
  apps/web/src/app/api/integrations/zoom/callback/route.ts
  apps/web/src/app/api/webhooks/zoom/route.ts
  apps/web/src/app/creator/integrations/page.tsx           # OAuth connect screen

MODIFY
  packages/shared/src/db/schema/live-sessions.ts           # add meetingProvider
  packages/shared/src/validators/live-session.ts           # add scheduleZoomSchema
  apps/api/src/trpc/routers/live-session.ts                # add scheduleViaZoom
  apps/web/src/app/creator/live-sessions/new/page.tsx      # add meeting-source toggle
  apps/web/src/app/creator/layout.tsx                      # add Integrations nav entry
  apps/api/src/trpc/index.ts                               # register zoomIntegrationRouter
```

## Open decisions (resolve before implementing)

1. **Token encryption key in dev** — generate via `openssl rand -base64 32` and commit to `.env.local`, OR use AWS KMS even in dev?
2. **Cron for webhook backstop** — BullMQ repeatable job daily, or skip until users report missing recordings?
3. **Multi-account support** — one creator → one Zoom account, or allow many? (Spec says one for MVP.)
4. **Embedded Zoom Web SDK** — separate sub-feature later? Adds ~1 day, gives in-app meeting UX without leaving ExamForge.

## Implementation prompt (paste into a new session when ready)

> Build Live Sessions Option B (Zoom OAuth + API) per `docs/features/LIVE_SESSIONS_OPTION_B_ZOOM.md`. Branch: `creators-feature` (or current trunk after consolidation) → `feat/live-sessions-zoom`. Honor the migration warning in `.claude/plans/next-session-prompts.md`. Do not start the dev server — the user runs it from Cursor IDE. When done, commit and open a PR.
