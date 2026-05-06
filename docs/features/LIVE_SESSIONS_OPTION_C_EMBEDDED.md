# Live Sessions — Option C: Embedded Video SDK

**Status:** Design doc — not yet implemented.
**Prereq:** Option A (Google Meet URL paste) is shipped on `feat/live-sessions`.
**Build estimate:** ~1 focused day after vendor pick.
**Cost:** Per-participant-minute (varies by vendor — see comparison below).

## When to choose this over A or B

- Pick **C** when "students never leave ExamForge" matters — full embedded UX with custom controls.
- Pick C when you want platform-owned recording, attendance, and analytics out of the box.
- Don't pick C if your audience is mostly on 2G/3G — fallback to A may be needed.
- Don't pick C if you can't absorb per-minute costs at the scale you expect.

## Vendor comparison

|                 | Daily.co            | 100ms              | LiveKit Cloud              |
| --------------- | ------------------- | ------------------ | -------------------------- |
| HQ              | USA                 | India 🇮🇳           | USA                        |
| Free tier       | 200 part-min/day    | **10,000 min/mo**  | 5,000 min/mo               |
| After free      | $0.004/min          | **$0.001/min**     | $0.005/min                 |
| India servers   | ✓ (multi-region)    | ✓ (primary)        | ✓                          |
| Web SDK quality | Excellent React SDK | Good React SDK     | Good React SDK             |
| Recording       | Add-on $0.012/min   | Included           | Included                   |
| Self-hostable   | No                  | No                 | **Yes** (open source)      |
| Best for        | Quick prototyping   | **India audience** | Long-term self-host option |

**Recommendation: 100ms.** India HQ + cheapest + Indian audience-tested + 10K free min/mo covers a lot of MVP testing. ₹0.08/student-hour vs ₹0.30 for Daily.co.

Rest of this doc assumes 100ms. Daily.co/LiveKit substitutions are noted where they differ.

## End-to-end wireframes (text)

### 1. Schedule (no per-creator setup needed)

```
┌──────────────────────────────────────────────────────────┐
│  /creator/live-sessions/new                              │
│  ─────────────────────────────────────                   │
│                                                          │
│  Title         [_____________________________]           │
│  ...                                                     │
│                                                          │
│  Meeting source                                          │
│  ⊙ Embedded HD video (recommended)                       │
│      ✓ Students never leave ExamForge                    │
│      ✓ Auto-recording, attendance, chat                  │
│      ⓘ Bandwidth: ~1.5 Mbps per student                  │
│      💰 Costs ₹0.08/student-hour (paid by ExamForge)     │
│  ○ Paste my own URL (Meet, Zoom, Teams)                  │
│                                                          │
│  [If Embedded selected]                                  │
│   ↳ Recording:    ☑ Enable                               │
│   ↳ Max attendees: [100]  (defaults from classroom)      │
│   ↳ Layout:        Active speaker  ▼                     │
│   ↳ Chat:          ☑ Enable                              │
│                                                          │
│                              [ Cancel ] [ Schedule ]     │
└──────────────────────────────────────────────────────────┘
```

On submit:

- API call: `POST https://api.100ms.live/v2/rooms` with template_id + room name
- 100ms returns `{ id, name, customer_id }`
- We store `provider_room_id` and `meeting_provider='100ms'`
- `meeting_url` = our internal URL: `/dashboard/live/[sessionId]/room`

### 2. Student join → in-app room

```
[Student clicks Join on /dashboard/live]
   ↓
[We call our API] liveSession.getJoinToken({ sessionId })
   ↓
[Server] Verify auth + classroom membership
[Server] Generate 100ms auth token (JWT signed with HMS app secret):
   {
     access_key: HMS_APP_ACCESS_KEY,
     room_id: <session.providerRoomId>,
     user_id: <ctx.userId>,
     role: 'student',
     type: 'app',
     iat: now,
     exp: now + 24h,
   }
   ↓
[Browser] Navigate to /dashboard/live/[id]/room?token=<jwt>
   ↓
[Page] Mount @100mslive/react-sdk <HMSRoomProvider>
   ↓
[Page] Auto-join with token → live video grid renders
```

### 3. In-room UX (`/dashboard/live/[id]/room`)

```
┌────────────────────────────────────────────────────────────┐
│  ← Back to classroom               Pharmacology · LIVE 🔴  │
│  ─────────────────────────────────────────────────────────│
│                                                            │
│   ┌───────────────────────┐  ┌──────────────────────────┐ │
│   │                       │  │ Participants (24)        │ │
│   │   Active speaker      │  │ ▸ Test Creator (host)    │ │
│   │   (creator's webcam)  │  │ ▸ Sameesh K               │ │
│   │                       │  │ ▸ Priya R                 │ │
│   │                       │  │ ▸ Arjun M                 │ │
│   └───────────────────────┘  │ … +20 more               │ │
│                              ├──────────────────────────┤ │
│   ┌──┐ ┌──┐ ┌──┐ ┌──┐         │ Chat                     │ │
│   │P│ │A│ │S│ │M│  …          │ Test Creator: Welcome!   │ │
│   └──┘ └──┘ └──┘ └──┘         │ Sameesh: question pls    │ │
│   participant tiles           │ [_______________] Send   │ │
│                              └──────────────────────────┘ │
│                                                            │
│  [🎤 Mute]  [📷 Camera]  [✋ Raise hand]  [💬 Chat]  [⏏ Leave] │
└────────────────────────────────────────────────────────────┘
```

### 4. Creator host controls (extra row)

```
[creator only, top-right]
[👥 Manage] [🔇 Mute all] [🎬 Recording: ●] [📊 End for all]
```

### 5. Recording auto-attach

```
[100ms] meeting ends, recording finalizes (~5 min)
   ↓
[100ms] POST → https://your-domain/api/webhooks/hms
   {
     "type": "beam.recording.success",
     "data": {
       "room_id": "<our session.providerRoomId>",
       "recording_path": "<s3-uri-or-https-url>",
       "duration": 3600
     }
   }
   ↓
[ExamForge] Verify x-100ms-signature
   ↓
[ExamForge] UPDATE live_sessions
   SET recording_url = <recording_path>,
       is_recorded = true,
       total_watch_minutes = duration / 60
   WHERE provider_room_id = <room_id>
   ↓
History card auto-shows "Watch recording" button.
```

## Schema additions (new migration 002X)

Add to `liveSessions`:

```ts
meetingProvider: varchar("meeting_provider", { length: 20 }).default("manual"), // 'manual' | '100ms' | 'daily' | 'livekit'
providerRoomId: varchar("provider_room_id", { length: 100 }),                    // 100ms room id
providerTemplateId: varchar("provider_template_id", { length: 100 }),            // which template was used
```

Optional new table for finer-grained recording tracking (multi-segment, multi-resolution):

```ts
// packages/shared/src/db/schema/live-session-recordings.ts
export const liveSessionRecordings = pgTable("live_session_recordings", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => liveSessions.id, { onDelete: "cascade" }),
  recordingUrl: text("recording_url").notNull(),
  durationSeconds: integer("duration_seconds"),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  status: varchar("status", { length: 20 }).default("processing"), // processing | ready | failed
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

## tRPC additions

```ts
// liveSession router extension
liveSession: {
  scheduleEmbedded: protectedProcedure.input(scheduleEmbeddedSchema).mutation();
  // ↳ creates 100ms room via API, returns { sessionId }

  getJoinToken: protectedProcedure.input(liveSessionIdInputSchema).mutation();
  // ↳ generates short-lived JWT for the caller, returns { token, role }
  // ↳ Mutation (not query) because issuing a token is a credential op
}
```

## New routes / pages

```
apps/web/src/app/(dashboard)/dashboard/live/[id]/room/page.tsx
  - Server component: fetch session via tRPC
  - Client wrapper with @100mslive/react-sdk
  - On mount: call getJoinToken, then hmsActions.join({ authToken })
  - Render <Conference /> custom layout

apps/web/src/app/api/webhooks/hms/route.ts
  - POST handler
  - Verify signature
  - Update live_sessions on beam.recording.success / beam.recording.failure
```

## New env vars

```
# 100ms (live.100ms.live)
HMS_APP_ACCESS_KEY=
HMS_APP_SECRET=
HMS_TEMPLATE_ID=                          # default room template (creator/student roles)
HMS_RECORDING_TEMPLATE_ID=                # template with recording enabled
HMS_WEBHOOK_PASSCODE=                     # for signature verification
HMS_API_BASE=https://api.100ms.live/v2
```

For Daily.co alternative:

```
DAILY_API_KEY=
DAILY_DOMAIN=examforge.daily.co
```

For LiveKit:

```
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_URL=wss://examforge.livekit.cloud
```

## Operator setup (one-time)

1. Sign up at https://dashboard.100ms.live
2. Create an App → copy `app_access_key` + `app_secret`
3. Create a Template:
   - Roles: `creator` (publish audio + video + screen, can mute others, can record), `student` (publish audio + video on permission, chat)
   - Enable "Recording" preset
   - Save template_id
4. Configure webhook: Settings → Webhooks → URL = `https://your-prod-domain/api/webhooks/hms`
5. Copy passcode to `HMS_WEBHOOK_PASSCODE`
6. Push secrets to AWS Secrets Manager.

## Cost model

- 100ms: 10K minutes/mo free → covers ~166 hours of single-participant or ~17 hours of 10-student sessions.
- After free: $0.001/min/participant ≈ ₹0.084/student-hour.
- Recording: included.
- Example: 50-student class × 1 hour = ₹4.20/session at 100ms vs ₹15/session at Daily.co.
- One-time engineering: ~8 focused hours.

## Risks + mitigations

| Risk                                       | Mitigation                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Per-minute cost spirals on a viral creator | Set monthly platform budget cap in `.env`; auto-fall-back to Option A when 80% reached, alert admin                |
| Bandwidth for 2G/3G students               | Detect via Network Information API, prompt "Audio only" mode (100ms supports), fall back to "Open in browser" link |
| 100ms API outage during scheduling         | Wrap creation in try/catch; fall back to manual URL paste                                                          |
| Token leakage in URL                       | Use mutation-issued token via fetch, not URL param; pass via memory state                                          |
| Recording webhook lost                     | Daily cron polls 100ms recording API for sessions in `ended` status without recording_url                          |
| GDPR/India data residency                  | 100ms supports India region — pin via template config                                                              |

## Migration path from Option A

- Existing `manual` sessions stay untouched.
- New schedule form's "Meeting source" toggle defaults to whichever is configured (100ms env vars present → embedded; otherwise → manual).
- Recording field still works the same way for History cards.
- No breaking changes.

## Files to create/modify

```
NEW
  packages/shared/src/db/schema/live-session-recordings.ts  (optional)
  packages/shared/drizzle/002X_embedded_provider.sql        # via pnpm db:generate
  packages/shared/src/validators/live-session-embedded.ts
  apps/api/src/services/hms-client.ts                       # 100ms REST + JWT signer
  apps/api/src/services/hms-token.ts                        # token generation
  apps/api/src/trpc/routers/live-session.ts                 # extend with scheduleEmbedded + getJoinToken
  apps/web/src/app/(dashboard)/dashboard/live/[id]/room/page.tsx
  apps/web/src/app/(dashboard)/dashboard/live/[id]/room/HMSRoom.tsx   # client component
  apps/web/src/app/api/webhooks/hms/route.ts

MODIFY
  packages/shared/src/db/schema/live-sessions.ts            # add provider columns
  packages/shared/src/validators/live-session.ts            # add scheduleEmbeddedSchema
  apps/web/src/app/creator/live-sessions/new/page.tsx       # add meeting-source toggle
  apps/web/src/components/classroom/classroom-live-sessions.tsx
                                                            # if 100ms session, route Join → /room/page instead of new tab
  apps/web/package.json                                     # add @100mslive/react-sdk @100mslive/hms-video-store

NPM
  pnpm --filter @examforge/web add @100mslive/react-sdk @100mslive/hms-video-store
  pnpm --filter @examforge/api add jsonwebtoken @types/jsonwebtoken
```

## Open decisions

1. **Vendor lock-in** — 100ms vs Daily vs LiveKit. Recommendation = 100ms for Indian-audience economics.
2. **In-room chat persistence** — store messages in DB or rely on 100ms's transient chat?
3. **Token expiry** — 1h vs 24h; longer = better UX, slightly bigger blast radius if leaked.
4. **Audio-only fallback** — auto-detect or let students choose?
5. **Whiteboard / screen-share permissions** — by-default for creator, request-based for students.

## Implementation prompt (paste into a new session when ready)

> Build Live Sessions Option C (embedded video via 100ms) per `docs/features/LIVE_SESSIONS_OPTION_C_EMBEDDED.md`. Branch: `creators-feature` (or current trunk) → `feat/live-sessions-embedded`. Honor the migration snapshot warning in `.claude/plans/next-session-prompts.md`. Do not start the dev server — the user runs it from Cursor IDE. When done, commit and open a PR.

## A vs B vs C — final recommendation matrix

| Question                                                                     | Pick                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| Just need it shipped today?                                                  | A (already done)                                       |
| Creators all already have Zoom Pro?                                          | B                                                      |
| Indian student audience, want embedded UX, willing to absorb ₹/student-hour? | C with 100ms                                           |
| Need full white-label, no third-party brand?                                 | C with LiveKit (self-hosted)                           |
| Mix?                                                                         | A + (B OR C) — keep A as the always-available fallback |
