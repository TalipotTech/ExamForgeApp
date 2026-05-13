# Live Sessions — Documentation Index

Four docs cover the Live Sessions feature, each aimed at a different reader. Start with the one that matches what you're trying to do.

## Pick your starting point

| If you're…                                                                  | Read                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A **creator** scheduling your first class                                   | [`LIVE_SESSIONS_CREATOR_GUIDE.md`](./LIVE_SESSIONS_CREATOR_GUIDE.md)         |
| An **operator / engineer** wiring up Zoom + 100ms accounts and webhook URLs | [`LIVE_SESSIONS_SETUP_GUIDE.md`](./LIVE_SESSIONS_SETUP_GUIDE.md)             |
| A **product / engineering** lead deciding whether to ship Zoom integration  | [`LIVE_SESSIONS_OPTION_B_ZOOM.md`](./LIVE_SESSIONS_OPTION_B_ZOOM.md)         |
| A **product / engineering** lead deciding whether to ship embedded video    | [`LIVE_SESSIONS_OPTION_C_EMBEDDED.md`](./LIVE_SESSIONS_OPTION_C_EMBEDDED.md) |

## What each doc contains

### `LIVE_SESSIONS_CREATOR_GUIDE.md`

Non-technical walkthrough for teachers using the feature. Covers:

- The three meeting source choices side-by-side
- How to schedule
- One-time Zoom connect at `/creator/integrations`
- What students see at each step (list, join, recording)
- Common questions (status badges, recording delays, classroom binding)

No env vars, no SQL, no architectural detail. Safe to share with non-engineering staff.

### `LIVE_SESSIONS_SETUP_GUIDE.md`

Operational companion to the design docs. Covers:

- DB migration + feature flag toggles
- Step-by-step Zoom Marketplace app creation (scopes, redirect URLs, webhook subscription)
- Step-by-step 100ms account + template + role naming (the `creator` / `student` role names are required — design rationale in the Option C doc)
- ngrok setup for local-dev webhooks
- All env vars in `.env.example` with what each one means
- End-to-end smoke test checklists per option
- Production deployment: secrets manager, webhook URL updates, app URL env
- Operational FAQ (classroom_id scoping, timezone, recording backfill, token rotation)
- Code locations table

### `LIVE_SESSIONS_OPTION_B_ZOOM.md`

Design rationale for Option B (Zoom OAuth). Covers:

- Why Zoom over paste-URL / embedded — when each makes sense
- End-to-end wireframes (OAuth, schedule, student join, recording auto-attach)
- Schema additions
- tRPC router shape
- Risk matrix + mitigations

Read this before deciding to invest in the Zoom flow.

### `LIVE_SESSIONS_OPTION_C_EMBEDDED.md`

Design rationale for Option C (embedded video via 100ms). Covers:

- Vendor comparison (100ms vs Daily.co vs LiveKit) and why we picked 100ms
- End-to-end wireframes (schedule, in-app room, host controls, recording webhook)
- Schema additions
- Cost model (per-participant-minute)
- Risk matrix (cost spirals, low-bandwidth fallback, GDPR)

Read this before deciding to invest in embedded video.

## How the three options relate

All three coexist in the same product. The schedule form shows up to three radio options on `/creator/live-sessions/new`; each radio appears only when its prerequisites are met:

1. **Paste my own URL** (Option A) — always visible, no setup required.
2. **Auto-create with Zoom** (Option B) — visible after a creator connects their Zoom account at `/creator/integrations`. Visible per-creator.
3. **Embedded HD video** (Option C) — visible when `HMS_APP_ACCESS_KEY` is configured platform-wide. Visible to everyone or nobody.

Default-pick precedence: Embedded → Zoom → Paste URL. The form lets the creator switch freely between any visible options on each session.

## Status

| Slice                       | Status  | PR                                                       |
| --------------------------- | ------- | -------------------------------------------------------- |
| Option A — paste URL        | Shipped | merged on `feat/live-sessions`                           |
| Option B — Zoom             | Shipped | [#6](https://github.com/TalipotTech/ExamForgeApp/pull/6) |
| Option C — embedded (100ms) | Shipped | [#7](https://github.com/TalipotTech/ExamForgeApp/pull/7) |

## Known follow-ups (not on any active branch)

These came out of the end-to-end smoke test but are deferred to keep the live-sessions PRs focused. Each is a self-contained slice worth a separate PR:

- **In-room chat / screen-share / hand-raise / host "Mute all"** for Option C (the design doc mentions all of these; current implementation is mic / camera / leave only).
- **Audio-only fallback** for slow connections (Network Information API → prompt to switch).
- **Daily cron for recording backfill** — poll Zoom + 100ms recording APIs for sessions in `ended` status without a `recording_url`, attach lazily.
- **Monthly platform-spend cap for 100ms** — auto-fall-back to Option A when 80% of the budget is consumed; admin alert.
- **Sentry filter for `code: 3002` (no device available)** — so device-not-available errors don't pollute the bug tracker.
- **Migrate `timestamp` columns to `timestamptz`** — closes the timezone footgun root-cause-style instead of the per-query `now() AT TIME ZONE 'UTC'` workaround we use now. Touches every table with time columns, so it deserves its own slice.
