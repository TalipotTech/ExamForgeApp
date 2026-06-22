# Next-session prompts — Phase C/D remaining slices

Six self-contained prompts. Paste the relevant section into a fresh Claude
Code session. Each prompt is independent and assumes no prior conversation
context.

Order of recommendation (low blast radius → high):

1. Promotions admin flow
2. Creator analytics dashboard
3. Public creator directory `/creators`
4. Subscription pool distribution worker
5. ~~Live sessions~~ — **SHIPPED** (Options A + B + C all built; see § Status below)
6. ~~AI tutor / RAG~~ — **SHIPPED** (core slice merged; 4 multimedia follow-ups in §7)

---

## Status (as of 2026-06-21) — slice integration

The four "remaining" slices below were each **built on their own branch in
earlier sessions but never merged**. Three of them (no migration conflicts)
have now been integrated into `creators-feature`:

| Slice                          | Branch                          | Status                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Promotions admin flow       | `feat/promotions-admin`         | **Merged** → `creators-feature` (9a2401e)                                                                                                                                                                        |
| 2. Creator analytics dashboard | `feat/creator-analytics`        | **Merged** → `creators-feature` (1cd8a20)                                                                                                                                                                        |
| 4. Subscription-pool worker    | `feat/subscription-pool-worker` | **Merged** → `creators-feature` (5a4cbfa); 13 vitest tests pass                                                                                                                                                  |
| 3. Public creator directory    | `feat/creator-directory`        | **Merged** → `creators-feature` (36a0c60). The branch's stale 0024 rename/snapshot was discarded (kept ours); the `slug` column was regenerated cleanly as `0027_empty_morlun.sql` (pure `ADD COLUMN` + unique). |

**All four slices are now integrated.** All merges typecheck clean across
shared/api/web. Conflicts were confined to additive files (`seed.ts`,
`trpc/index.ts`, `workers/index.ts`, the two layouts, `creator.ts`,
`creator-profiles.ts`, `package.json`) — resolved as unions / keep-ours for
the drizzle artifacts. **Remaining work tracked in
`docs/CREATORS_TODO_NEXT_PHASE.md`** (video transcription 7a, auto-extract 7c,
Sarvam validation 7b, Gemini billing 7d). Next: push `creators-feature`.

## Status (as of 2026-05-09)

| Slice                                 | Status               | PR / branch                                                                          |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| Live sessions — Option A (paste URL)  | Shipped + merged     | `feat/live-sessions`                                                                 |
| Live sessions — Option B (Zoom OAuth) | Shipped, **PR open** | [#6](https://github.com/TalipotTech/ExamForgeApp/pull/6) → `feat/live-sessions`      |
| Live sessions — Option C (embedded)   | Shipped, **PR open** | [#7](https://github.com/TalipotTech/ExamForgeApp/pull/7) → `feat/live-sessions-zoom` |
| Live sessions — docs (creator + ops)  | Shipped on #7        | bundled in PR #7                                                                     |
| AI tutor / RAG — core slice           | Shipped + merged     | `feat/ai-tutor-rag` → `creators-feature`                                             |
| AI tutor — multimedia follow-ups      | Deferred             | see §7 (video / Sarvam-batch validation / auto-trigger / Gemini billing)             |

**Before starting any NEW slice that adds schema** (RAG / #6 below is the
imminent one): merge the live-sessions PR tree into `creators-feature`
first. Otherwise the new slice's migration will collide on number 0024 /
0025 with the live-sessions migrations. Sequence:

```
# 1. Review + squash-merge PR #6 (Zoom)        → feat/live-sessions
# 2. Review + squash-merge PR #7 (embedded)    → feat/live-sessions-zoom
# 3. Merge feat/live-sessions-zoom → creators-feature (no-ff, then push)
# 4. Optional: delete the now-merged feature branches
# 5. Start the next slice's prompt in a FRESH Claude session
```

After merging, `creators-feature` will sit at migration `0025_nice_sister_grimm.sql`
and the next slice's `pnpm db:generate` will produce `0026_*.sql` cleanly.

---

## Universal heads-up (paste at the top of every session)

> **Branch:** `creators-feature`. Work in feature branches off it; squash-merge back.
>
> **Dev workflow rule** (`.claude/rules/dev-workflow.md`): do NOT start the dev
> server from Claude Code. The user runs it from Cursor IDE. Make code
> changes, commit, merge — that's it. If a preview is needed, ask.
>
> **Migration state (current — RESOLVED on `feat/live-sessions-zoom`):**
> The original `0024_assignment_attachments.sql` snapshot mismatch was
> fixed during the live-sessions slice. The journal now ends at:
>
> - `0024_low_squadron_supreme.sql` — assignment-attachments columns +
>   `creator_zoom_integrations` table + `live_sessions.meeting_provider`
> - `0025_nice_sister_grimm.sql` — `live_sessions.provider_room_id` +
>   `provider_template_id`
>   Both have matching `*_snapshot.json` files. After the live-sessions PR
>   tree merges to `creators-feature` (see § Status above), `pnpm db:generate`
>   on a new branch will produce `0026_*.sql` cleanly. Nothing to delete
>   by hand any more.
>
> If for any reason `pnpm db:generate` re-emits an old migration's
> ALTER TABLEs, that means your branch is missing 0024 / 0025 — rebase
> onto the latest `creators-feature` first.
>
> **Patterns to mirror** (skim before building UI):
>
> - `apps/web/src/components/content/content-card.tsx` — card grid with
>   16:9 preview, hover-autoplay video, type badge
> - `apps/web/src/components/content/media-preview.tsx` — full media render
> - `apps/api/src/trpc/routers/classroom.ts` — auth helpers
>   (`requireTeacherAccess`, `requireMemberOrTeacher`), feature-flag gating
>   via `assertCreatorsFeature`, JSONB array filtering pattern
> - `apps/api/src/trpc/routers/assignment.ts` — most recent router
>   following all conventions
> - `packages/shared/src/validators/assignment.ts` — most recent validator
>
> **Code conventions** (`CLAUDE.md`): 2-space indent, ES modules, named
> exports, explicit return types, kebab-case files, PascalCase components.
> Zod for ALL API input. Drizzle for ALL schema. `protectedProcedure` for
> auth, `adminProcedure` for admin, `subscriberProcedure` for paid.

---

## 1. Promotions admin flow

```
Build the admin review + management UI for the existing `promotions` table.

Branch: creators-feature → feat/promotions-admin

Heads-up: read `.claude/plans/next-session-prompts.md` § "Universal heads-up"
for the migration snapshot warning, dev-workflow rule, and patterns to mirror.
You should NOT need a new migration for this slice.

Schema (already exists, migration 0023):
  packages/shared/src/db/schema/promotions.ts
  Columns: id, creator_id, promotion_type (banner|featured|sponsored),
  content_id?, listing_id?, classroom_id?, banner_image_url?, headline,
  description, cta_text, cta_url, target_exams (jsonb[]), target_subjects,
  budget_type (impressions|clicks|flat), budget_amount_inr, spent_amount_inr,
  impressions, clicks, conversions, starts_at, ends_at,
  status (pending|active|paused|expired|rejected), approved_by, created_at

Existing patterns to follow:
  - Admin pages live under `apps/web/src/app/admin/` (check existing
    /admin/discovery, /admin/verification for layout patterns)
  - Use `adminProcedure` from `apps/api/src/trpc/trpc.ts`
  - Mutations log to `admin_audit_log` — see admin-users router for the helper
  - Existing promotion router stub: `apps/api/src/trpc/routers/promotion.ts`
    (extend if it's already there, or create)

Build:
1. tRPC `promotion` router (extend existing if present):
   - listPending() — admin-only, returns promotions where status='pending'
   - listActive() — admin-only, status='active'
   - approve({ promotionId, notes? }) — sets status='active', approved_by=ctx.userId
   - reject({ promotionId, reason }) — sets status='rejected'; store reason in
     a new column? (NO — log to admin_audit_log instead, no schema change)
   - pause({ promotionId }) / resume({ promotionId }) — toggles active↔paused
   - getMetrics({ promotionId }) — returns impressions/clicks/conversions/spent

2. Admin UI at /admin/promotions:
   - Tabs: Pending | Active | Expired | Rejected
   - Each row: thumbnail preview of banner_image_url, headline,
     creator displayName (join creator_profiles), budget, dates, action buttons
   - Pending tab: Approve / Reject (reject opens a small textarea dialog)
   - Active tab: Pause / View metrics drawer
   - Use shadcn Dialog for reject reason, Sheet for metrics drawer

3. Register the router in `apps/api/src/trpc/index.ts` if it isn't already.

Explicitly NOT in scope:
  - Creator-side "Create promotion" form (separate slice)
  - Public-facing banner display surface
  - Impression tracking pixel / click tracking endpoint
  - Stripe/Razorpay charge for promotion budget

Acceptance:
  - Admin can see pending list, approve/reject with reason, pause active ones
  - All admin actions logged to admin_audit_log
  - Reject reasons surfaced in a "Why rejected?" tooltip on the rejected tab
  - No new schema columns; reuse existing fields

When done: commit on feat/promotions-admin with conventional-commit message,
open PR against creators-feature. Don't push to main.
```

---

## 2. Creator analytics dashboard

```
Build a read-only analytics dashboard for creators at /creator/analytics.

Branch: creators-feature → feat/creator-analytics

Heads-up: read `.claude/plans/next-session-prompts.md` § "Universal heads-up".
This slice is read-only — NO schema changes, NO new migrations.

Data sources (all existing tables):
  - creator_profiles: follower_count, content_count, total_views,
    total_students, total_sales, total_revenue_earned, average_rating
  - creator_content: per-content view_count, like_count, doubt_count,
    total_watch_minutes, avg_rating
  - content_views: per-day rollup (created_at) — use date_trunc for charts
  - creator_earnings: status (pending|available|paid_out), amount_inr,
    earning_type (sale|subscription_pool|tip), created_at, available_at
  - creator_wallets: balance_inr, pending_inr, lifetime_earned_inr
  - classrooms: studentCount, teacherId
  - doubts: status (open|answered|closed) per content_id

Charts library: check `apps/web/package.json` for what's installed. If
nothing chart-ish is there, recharts is the safe pick — small bundle, works
with React 19. Add ONLY if needed; if you can do it with simple bars + CSS,
prefer that.

Build:
1. tRPC `creatorAnalytics` router (new):
   - overview() — returns the headline numbers: total_views, total_students,
     wallet balance, pending earnings, follower delta last 30d
   - revenueByDay({ days: 30 | 90 | 365 }) — array of { date, amount } from
     creator_earnings, grouped by date_trunc('day', created_at)
   - viewsByDay({ days }) — same shape from content_views
   - topContent({ limit: 10 }) — order creator_content by view_count desc
   - classroomEnrollment() — { classroomId, name, studentCount, joinedLast30 }
   - doubtStats() — counts by status; response time from doubt_responses

2. Page at /creator/analytics with tabs:
   - Overview — KPI cards (4-6 numbers) + revenue line chart + views line chart
   - Content — table of top content with sortable columns
   - Classrooms — list with enrollment trend
   - Engagement — doubt response rate, follower delta

3. All queries are creator-scoped: derive ctx.userId → creator_profiles.id,
   filter every aggregate by that creator_id. The
   `requireCreatorProfile(db, userId)` helper from creator-content router
   is your friend — copy it into the new router.

Explicitly NOT in scope:
  - Real-time updates / websockets
  - Export to CSV (separate slice)
  - Per-classroom student leaderboard
  - Student-side "my progress" analytics

Acceptance:
  - All numbers cross-reference correctly (e.g. wallet balance ==
    sum of creator_earnings where status='available')
  - Empty states render cleanly when a creator has no content yet
  - Tabs preserve filter state (days selector) via URL query params
  - SSR-friendly — uses TanStack Query staleTime to avoid refetch storms

When done: commit on feat/creator-analytics, open PR against creators-feature.
```

---

## 3. Public creator directory `/creators`

```
Build the public-facing creator directory at /creators (no auth required).

Branch: creators-feature → feat/creator-directory

Heads-up: read `.claude/plans/next-session-prompts.md` § "Universal heads-up".
This slice is read-only — NO schema changes.

This is a leftover from Phase A. The schema was built but the public surface
was never shipped. The `creator_profiles` table has all the fields you need
(verification_status, is_featured, follower_count, content_count, etc.).

Build:
1. tRPC additions to existing `apps/api/src/trpc/routers/creator.ts`
   (create the router if it doesn't exist):
   - listPublic({ limit, offset, examId?, search?, sort? }) — publicProcedure
     - Filter: only is_active=true AND verification_status in
       ('verified','featured')
     - Sort options: 'featured' (is_featured desc, followers desc),
       'rating' (average_rating desc), 'newest' (created_at desc)
     - Search: ILIKE on display_name, OR JSONB containment on
       specializations/exams_covered
   - bySlug({ slug }) — publicProcedure; resolve creator profile +
     their published creator_content (top 12) + their public classrooms
     (where isPaid=false, isActive=true) so visitors can preview before
     joining

2. Routes (public, no auth):
   - apps/web/src/app/creators/page.tsx — directory grid
     - Filter sidebar: exam picker, verified-only toggle, sort dropdown
     - Card grid (3 columns desktop): cover image, avatar, displayName,
       institution, rating stars, follower count, "View profile" button
     - Pagination via search params (?page=2&exam=xxx&sort=featured)
   - apps/web/src/app/creators/[slug]/page.tsx — creator detail
     - Hero: cover_image_url banner, avatar, name, bio, social links,
       Follow button (auth-gated)
     - Tabs: Content (ContentCard grid using existing component),
       Classrooms (cards with join code if free), About (qualification,
       institution, exams covered)

3. SEO via generateMetadata:
   - Directory: title "Top exam-prep creators on ExamForge", description
     pulled from list of top creator names
   - Detail: per-creator title + description + og:image from cover_image_url

4. Add a `slug` column to creator_profiles? Check if it exists. If NOT,
   you need a migration — follow the snapshot warning at the top, and the
   slug should be derived from display_name via the same slugify() helper
   in `apps/web/src/app/api/creator-content/upload/route.ts`.

Existing pattern to mirror: `apps/web/src/app/(public)/exams/page.tsx`
should be the closest analog for a public listing page (caching, SEO,
SSR with TanStack Query).

Explicitly NOT in scope:
  - Follow / unfollow logic (separate slice)
  - Creator's blog or social feed
  - Creator-to-creator messaging
  - Search engine sitemap (handle in a sweep later)

Acceptance:
  - /creators renders without auth, returns within 500ms cached
  - Filtering + pagination work via URL state (deep-linkable)
  - Each creator detail page passes basic Lighthouse SEO checks
  - Featured creators always pinned to the top regardless of sort

When done: commit on feat/creator-directory, open PR against creators-feature.
```

---

## 4. Subscription pool distribution worker

```
Build the BullMQ worker that distributes monthly subscription revenue across
creators based on free-tier viewing.

Branch: creators-feature → feat/subscription-pool-worker

Heads-up: read `.claude/plans/next-session-prompts.md` § "Universal heads-up".
This slice does NOT need real subscription revenue to ship — use fixtures
in tests. Real revenue is a separate concern.

Schema (already exists, migration 0023):
  packages/shared/src/db/schema/subscription-pool.ts
  Columns: id, creator_id, period_month (varchar 7, e.g. "2026-04"),
  free_view_count, total_watch_minutes, weighted_score, pool_share_inr,
  total_pool_inr, status (pending|distributed|failed), distributed_at,
  breakdown (jsonb), created_at, updated_at
  Unique: (creator_id, period_month)

Distribution logic (write this in `apps/api/src/services/subscription-pool.ts`,
keep the worker thin):

1. computeMonthlyPool(periodMonth: "YYYY-MM"):
   - Sum payment_orders where status='completed' AND
     order_type='subscription' AND created_at within period
   - Platform keeps 30% — pool is 70% of subscription revenue

2. computeCreatorScores(periodMonth):
   - For each creator with content_views in period:
     - free_view_count = count(content_views) where credit_cost=0
     - total_watch_minutes = sum(watched_seconds)/60
     - weighted_score = (free_view_count × 1) + (total_watch_minutes × 0.5)
   - Cap any single creator at 25% of the pool to prevent gaming

3. distributePool(periodMonth):
   - For each creator: pool_share_inr =
     (weighted_score / sum_of_all_weighted_scores) × total_pool_inr
   - Insert subscription_pool row (idempotent via unique constraint)
   - Insert creator_earnings row: earning_type='subscription_pool',
     status='available', available_at = now()
   - Increment creator_wallets.balance_inr atomically
   - Mark subscription_pool.status='distributed', distributed_at = now()
   - Store full breakdown in subscription_pool.breakdown jsonb:
     { freeViewCount, totalWatchMinutes, weightedScore, allCreatorsScore,
       poolShareCalc, formula }

Worker:
  apps/api/src/workers/subscription-pool-worker.ts
  - BullMQ repeatable job: 1st of every month at 02:00 IST
  - Computes for previous month (e.g. April run = March period)
  - Idempotent: skip if subscription_pool row already exists with
    status='distributed' for that period_month

Admin UI at /admin/subscription-pool:
  - List periods with totals (revenue, distributed, # creators)
  - Drill into period: per-creator breakdown table
  - "Run for [previous month]" button — admin-triggered manual run
  - Read-only view of breakdown jsonb (collapsible JSON viewer)

Tests (Vitest, mandatory for this slice):
  - Fixtures with 3 creators and known view/watch counts
  - Verify weighted scores match formula
  - Verify pool sums to exactly total_pool_inr (no rounding leakage —
    last creator absorbs rounding remainder)
  - Verify cap: when one creator has 90% of views, they get exactly 25%
  - Verify idempotency: re-running for the same month is a no-op

Existing patterns:
  - BullMQ worker setup: `apps/api/src/workers/syllabus-processor.ts`
  - Repeatable jobs: `apps/api/src/workers/portal-ingestion-worker.ts`
  - Admin trigger pattern: `apps/api/src/trpc/routers/admin-settings.ts`

Explicitly NOT in scope:
  - Creator payout / Razorpay payout integration (separate slice)
  - Subscription tier multipliers (free vs premium tier viewers)
  - Cross-currency support
  - Email notifications to creators

Acceptance:
  - All tests pass with deterministic outputs
  - Admin can manually trigger and re-trigger safely
  - Breakdown JSON makes the calculation auditable end-to-end
  - Worker is gated behind `creators.subscription_pool_enabled` feature flag

When done: commit on feat/subscription-pool-worker, open PR against
creators-feature.
```

---

## 5a. Live sessions — pre-coding decision (~~RESOLVE FIRST~~ — RESOLVED)

> **SHIPPED.** All three options (A — paste URL, B — Zoom OAuth,
> C — embedded via 100ms) built and behind PRs #6 + #7. Implementation
> docs at `docs/features/LIVE_SESSIONS_README.md` (index),
> `LIVE_SESSIONS_CREATOR_GUIDE.md` (user-facing),
> `LIVE_SESSIONS_SETUP_GUIDE.md` (ops setup), plus the two design docs
> we already had. This section preserved for historical context only —
> do not re-implement.
>
> Original pre-coding decision block follows:

```
Before writing any live-session code, the team needs a product decision.

Pick ONE:

A) Embedded Google Meet URLs (RECOMMEND for MVP)
   - Creator schedules session, our app generates a Meet URL via
     calendar.google.com link OR they paste their own
   - Students click the URL in a new tab, Meet handles everything
   - No analytics inside our app (attendance tracked by manual "Mark joined")
   - Build cost: ~half a day
   - $$ cost: free
   - Recording: students/teacher record on Google's side
   - Limitations: no embedded experience, no per-second analytics, students
     leave our app to attend

B) Zoom OAuth + Zoom API
   - Creator connects their Zoom account once via OAuth
   - We create meetings via API, get URLs and recording webhooks
   - Embedded via Zoom Web SDK or external link
   - Build cost: ~1-2 days (OAuth + meeting CRUD + webhook handling)
   - $$ cost: Zoom Pro for the host (creator)
   - Recording: auto-uploaded to Zoom, we get the URL via webhook
   - Limitations: every creator needs a Zoom account

C) Daily.co / 100ms / LiveKit embedded
   - Full SDK in iframe, fully embedded, custom UI
   - We get analytics, attendance, recording out of the box
   - Build cost: ~1 day
   - $$ cost: $0.004/participant-minute (Daily.co) ≈ ₹0.30/student-hour
   - Recording: included
   - Limitations: ongoing per-minute cost; bandwidth-heavy for students on
     2G/3G in India

D) WebRTC from scratch
   - Full control, zero ongoing cost
   - Build cost: weeks (signaling server, TURN, scaling)
   - Out of scope for this phase

Recommendation: ship A first. Revisit C if user feedback says embedded
experience matters and the per-minute cost is acceptable.

After decision, paste the live-sessions implementation prompt below, with
[OPTION] replaced.
```

## 5b. Live sessions — implementation (~~after decision~~ — SHIPPED)

> Preserved for reference. The implementation actually shipped covers
> ALL THREE options additively (A + B + C), exceeding the original
> single-option scope. The schedule form at
> `/creator/live-sessions/new` shows up to three radios conditioned on
> per-creator state (Zoom connect) and platform env (`HMS_APP_ACCESS_KEY`).
> Operational details in `docs/features/LIVE_SESSIONS_SETUP_GUIDE.md`.

```
Build creator-side scheduling + student-side joining for live sessions, using
[OPTION_DECIDED_ABOVE — A (Google Meet links) | B (Zoom API) | C (Daily.co)].

Branch: creators-feature → feat/live-sessions

Heads-up: read `.claude/plans/next-session-prompts.md` § "Universal heads-up".

Schema (already exists, migration 0023):
  packages/shared/src/db/schema/live-sessions.ts
  Columns: id, creator_id, classroom_id?, title, description, scheduled_at,
  duration_minutes, status (scheduled|live|ended|cancelled), meeting_type
  (embedded|external), meeting_url, meeting_id, is_recorded, recording_url,
  exam_id, subject, topic, max_attendees, peak_concurrent,
  total_watch_minutes, is_free, price_inr, started_at, ended_at, created_at

  packages/shared/src/db/schema/live-session-attendees.ts
  Columns: id, session_id, user_id, joined_at, left_at, watch_seconds
  Unique: (session_id, user_id)

Build:
1. tRPC `liveSession` router (extend existing stub):
   - schedule({ classroomId?, title, description, scheduledAt,
     durationMinutes, meetingUrl, isFree, priceInr? }) — creator only
   - listUpcoming({ classroomId? }) — both roles, joined to creator
   - listPast({ classroomId? }) — both roles, status='ended'
   - markJoined({ sessionId }) — student inserts attendees row, sets joined_at
   - markLeft({ sessionId, watchSeconds }) — updates left_at + watch_seconds
   - setRecordingUrl({ sessionId, recordingUrl }) — creator only
   - cancel({ sessionId }) — creator only
   - byId({ sessionId }) — joined to attendees count

2. Creator UI:
   - /creator/live-sessions — list + "Schedule new" button
   - Schedule form: title, description, datetime picker, duration,
     classroom selector (optional), meeting URL (option A/B-specific),
     is_free + price
   - For option B/C: integrate the SDK auth here

3. Student UI:
   - Add "Live" tab to existing classroom page (mirror Assignments tab)
   - List upcoming sessions with countdown, "Join" button (disabled until
     5 min before scheduled_at)
   - Past sessions: show recording link if available
   - Click Join → markJoined mutation, then open meeting_url in new tab
     (option A) or render embedded SDK iframe (option C)

4. Status state machine: scheduled → live (when first attendee joins)
   → ended (manual or auto after scheduled_at + duration_minutes + 30min)

Existing patterns:
  - Creator page layout: `apps/web/src/app/creator/classrooms/[id]/page.tsx`
  - Classroom tab pattern: same file's TabsList/TabsContent

Explicitly NOT in scope:
  - Push notifications when session goes live
  - Calendar integration (.ics export)
  - Paid live sessions checkout flow (gate via is_free for now, just hide
    join button if !is_free)
  - Live chat overlay

Acceptance:
  - Creator can schedule, students can join, attendance tracked
  - Status transitions cleanly without manual admin intervention
  - Recording URL surfaces on past sessions
  - Feature gated behind `creators.live_sessions_enabled` flag

When done: commit on feat/live-sessions, open PR against creators-feature.
```

---

## 6a. AI tutor / RAG — pre-coding decision (RESOLVE FIRST)

```
Before writing any RAG code, the team needs an infra decision.

Three questions:

Q1: Where do embeddings come from?
   A) On-the-fly: when a student opens the AI chat for a piece of content,
      we transcribe (if needed) + chunk + embed inline. Slow first request
      (~30s for a 10min video), cached forever after.
   B) Background worker: when content is published, queue a job that
      transcribes/chunks/embeds. First chat is instant. More infra to
      maintain.
   Recommend B for any real volume; A is fine for dev/early users.

Q2: Transcription source for video/audio?
   A) OpenAI Whisper API ($0.006/min)
   B) Gemini 2.0 Flash audio (cheaper, supports video natively)
   C) Local whisper.cpp (free but needs GPU on the worker host)
   Recommend B — already have Gemini wired up via ai-router; cheapest path.

Q3: Vector DB?
   A) pgvector in our existing Postgres (HNSW index already documented in
      `.claude/rules/database.md`)
   B) Pinecone / Weaviate (managed)
   Recommend A — already deployed, no new vendor.

After deciding, paste the implementation prompt below.
```

## 6b. AI tutor / RAG — implementation (after decision)

```
Build the RAG-backed AI tutor that answers student questions grounded in a
classroom's assigned content.

Branch: creators-feature → feat/ai-tutor-rag

PREREQUISITE — verify before starting:
  `git log --oneline creators-feature | head -5` must show the live-sessions
  merge (look for the embedded / Zoom commits). If it doesn't, STOP and ask
  the user to merge PRs #6 and #7 first — otherwise this slice's migration
  will collide with theirs on numbers 0024 / 0025. See § Status at the top
  of `.claude/plans/next-session-prompts.md`.

Heads-up: read `.claude/plans/next-session-prompts.md` § "Universal heads-up".
This slice DOES need new schema. Since the migration snapshot has already
been cleaned up (current head is `0025_nice_sister_grimm.sql`), just add
the new schema file and run `pnpm db:generate` — it'll produce `0026_*.sql`
with a matching snapshot. No manual deletion needed.

Decisions made (from prompt 6a):
  Embeddings: [B = background worker | A = on-the-fly]
  Transcription: [B = Gemini | A = Whisper | C = whisper.cpp]
  Vector store: A = pgvector

New schema:
  packages/shared/src/db/schema/content-embeddings.ts
    id, content_id (FK creator_content), syllabus_node_id?, chunk_index,
    source_text (text), embedding vector(1536), token_count, created_at
    Index: HNSW on embedding vector_cosine_ops
    Index: btree on content_id

Build:
1. Embedding pipeline (`apps/api/src/services/content-embedding.ts`):
   - extractTextForContent(content): string — body + image OCR text from
     metadata.mediaItems + transcript (call transcription provider for
     video/audio if not already cached in metadata.transcript)
   - chunkText(text, { maxTokens: 500, overlap: 50 }): chunks[]
   - embedChunks(chunks): float[][] via OpenAI text-embedding-3-small
   - upsertContentEmbeddings(contentId): orchestrates the above; idempotent
     by deleting existing rows for contentId before insert

2. Worker (if option B was chosen):
   `apps/api/src/workers/content-embedding-worker.ts`
   - BullMQ queue 'content-embedding'
   - Triggered on creator_content.is_published transition false→true
   - Logs cost to ai_usage_logs

3. tRPC `aiTutor` router:
   - ask({ classroomId, query, conversationId? }) — protectedProcedure
     - Verify caller is enrolled in classroomId (reuse classroom helpers)
     - Build candidate set: all creator_content where assignedClassrooms
       contains classroomId
     - Embed the query
     - Top-k similarity search (k=8) over content_embeddings WHERE
       content_id IN (candidate_ids), order by embedding <=> query_vec
     - Build RAG prompt with chunks + their source content titles for
       citation
     - Stream Claude Sonnet response (use `apps/api/src/ai/ai-router.ts`)
     - Return tokens + citation list (which chunks fed into the answer)
   - listConversations() — student's recent threads
   - getConversation({ id }) — full message history

4. Storage for chat threads — check if `topic_conversations` /
   `ai_conversations` already cover this. If yes, reuse. If no, add:
   ai_tutor_conversations(id, user_id, classroom_id, title, created_at)
   ai_tutor_messages(id, conversation_id, role, content, citations jsonb,
                     tokens_used, created_at)

5. UI:
   - /dashboard/classrooms/[id]/ai — chat interface
   - Add "AI Tutor" tab to existing student classroom page
   - Streaming response with token-by-token render
   - Citations rendered as numbered chips, click to scroll to source content

Cost tracking (mandatory per .claude/rules/ai-patterns.md):
  - Every embed call → ai_usage_logs row (provider, model, input_tokens,
    estimated_cost_usd, feature='rag-embed')
  - Every Claude generation → ai_usage_logs row (feature='rag-answer')
  - Cache identical queries by hash for 24h in Redis

Explicitly NOT in scope:
  - Cross-classroom search (intentionally scoped to one classroom per query)
  - Voice input
  - Image-input questions (handwritten doubt photos)
  - Quiz generation from chat history

Acceptance:
  - Asking a question grounded in content returns an answer in <3s with
    visible citations
  - Asking a question NOT covered by the content returns "I couldn't find
    this in your classroom's materials" instead of hallucinating
  - Re-running the same query within 24h hits Redis (no new AI cost)
  - Background embedding worker processes a 10-min video within 2 min
  - Feature gated behind `creators.ai_tutor_enabled` flag

When done: commit on feat/ai-tutor-rag, open PR against creators-feature.
```

---

## 7. AI tutor — multimedia follow-ups (after the RAG slice shipped)

> The core AI-tutor RAG slice (§6b) shipped on `feat/ai-tutor-rag` and
> merged to `creators-feature`. The pipeline works end-to-end: classroom
>
> - per-content RAG with citations, background embedding worker,
>   PDF/image OCR (4-provider fallback), audio transcription (Gemini 2.5
>   Flash primary → Sarvam sync → Sarvam batch → Whisper, with
>   content.language hints), and formatted transcript/extraction display
>   on creator + student views. These four items were deliberately
>   deferred. Each is independent.

### 7a. Video transcription (large files)

**Problem:** audio + PDF transcribe/extract fine, but video can't. A
424MB lecture mp4 fails on every provider: Gemini's inline `file`
content caps at 20MB, and Sarvam/Whisper don't accept video at all. The
error surfaces cleanly on the media row — this is a missing capability,
not a bug.

**Two viable paths (pick one — it's a deployment-dependency call):**

- **Gemini File API** — upload the video to Gemini's File API (handles
  up to 2GB, stored 48h), transcribe by URI instead of inline bytes. No
  new system dependency. Video-native, single call. Gemini-only (no
  fallback — but Sarvam/Whisper don't take video regardless). Needs
  Gemini billing active. Add a `runGeminiFileApiTranscription` path in
  `apps/api/src/ai/transcription-service.ts` that the dispatcher uses
  when `mimeType.startsWith("video/")` and size > the inline cap.
- **ffmpeg audio extraction** — extract the audio track (424MB video →
  ~10–40MB audio) with ffmpeg, then route through the EXISTING audio
  chain (Gemini inline if small, else Sarvam batch). Keeps the full
  multi-provider fallback. Adds ffmpeg as a system dependency in the
  worker container — update `apps/api/Dockerfile` (or the App Runner
  build) AND document the local-dev install. Two-step: extract → then
  transcribe.

Recommend Gemini File API if Gemini billing is reliably on (simpler, no
container change); ffmpeg if you want video transcription to survive a
Gemini outage. Key files: `transcription-service.ts`,
`transcription-queue.ts` (may need a longer job timeout for extraction),
the transcribe route's size/type gating.

### 7b. Sarvam batch — live validation

**Status:** the Sarvam batch path (`sarvam-saarika-batch`) is fully
wired and the `/v1` endpoint paths were fixed against Sarvam's docs, but
it has **never had a successful live run** — Gemini 2.5 Flash keeps
succeeding first, so the fallback is never reached. The batch flow
(init → upload to Azure SAS → `POST /job/v1/{id}/start` → poll
`GET /job/v1/{id}/status` → fetch output) is unverified against the
live API beyond init+upload.

**Task:** force the batch path once (temporarily reorder
`TRANSCRIPTION_FALLBACK_ORDER` so batch is first, or point a >30s audio
file at it while Gemini quota is exhausted) and confirm: (a) `/start`
returns 200 at the `/v1` path, (b) status transitions Accepted →
Running → Completed, (c) `fetchTranscript` actually reads the output
blob. If output fetch fails after a Completed job, switch from the
Azure-container-listing approach to Sarvam's documented
`POST /speech-to-text/job/v1/download-files` (body `{ job_id, files }`).
Watch the `[sarvam-batch]` diagnostic logs — they narrate every step.
Key file: `apps/api/src/ai/transcription-batch-service.ts`.

### 7c. Auto-trigger OCR / transcription on publish

**Current:** OCR (documents/images) and transcription (audio/video) are
manual — the creator clicks "Extract text" / "Transcribe" per media item
on the content Edit tab. That's deliberate for cost control while the
feature settles, but for steady-state it's friction.

**Task:** on `creator_content` publish (the `togglePublish` mutation in
`apps/api/src/trpc/routers/creator-content.ts`, which already enqueues
the embedding job), also enqueue OCR for un-extracted document/image
media items and transcription for un-transcribed audio/video media
items. Gate behind a flag (e.g. `creators.auto_extract_on_publish`) so
it can be turned off. Respect the existing `ocr_enabled` flag for OCR.
Idempotency: skip items that already have `extractedText` or are
`processing`. Mind cost — a publish could fan out many provider calls;
consider only auto-extracting when the creator opts in per-upload (like
the existing `handwritten` flag) rather than blanket-on.

### 7d. Gemini billing / quota (ops, not code)

**Not a code task** — a standing ops reminder. Gemini's free tier sits
at quota=0, so the primary transcription/OCR/video paths intermittently
fall through to paid fallbacks (Claude, OpenAI, Sarvam) or fail when
those are also exhausted. Top up Gemini billing in Google AI Studio /
GCP so `gemini-2.5-flash` and `gemini-2.5-pro` are reliably available as
the cheapest primary. No code change; once billing is on, the existing
fallback chains just stop being exercised as often.

---

## Closing notes

- Each prompt is fully self-contained — paste it into a fresh session and
  the agent has everything it needs.
- The "Universal heads-up" block at the top should be referenced from each
  session via the path `.claude/plans/next-session-prompts.md`.
- **Migration snapshot is now healthy** — the old 0024 hand-written
  warning is preserved as historical context inside the heads-up block,
  but no manual cleanup is required for future schema changes. Just
  `pnpm db:generate` cleanly off the latest `creators-feature`.
- When the next slice ships, update § Status at the top of this file
  with the PR link + branch name so the next agent knows what's done.
