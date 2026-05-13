# Backlog — slices explicitly deferred from earlier sessions

Self-contained prompts for every "Explicitly NOT in scope" item across the
Phase A–D slices in `.claude/plans/next-session-prompts.md` plus the live-
sessions and AI-tutor slices that came after. Each entry has:

- **Why deferred** — the original scoping rationale
- **Dependencies** — what must already be in main before building
- **Build estimate** — rough size, focused hours
- **Prompt** — paste verbatim into a fresh Claude Code session

Order doesn't matter except where flagged. Pick by what unblocks the most
user pain.

## Suggested build order (when picked up)

1. **Live-sessions push notifications** + **.ics export** — small, high-UX-value, unblocks creator confidence
2. **Promotions creator-side form** — needed before the admin approve/reject flow has any traffic
3. **Subscription pool Razorpay payout** — required for creators to actually receive money (currently just bookkeeping)
4. **Public banner display + impression tracking** — turns promotions into a revenue lever
5. **Student "my progress" analytics** — a parallel slice to the creator analytics shipped earlier
6. **AI tutor — voice input, image-input** — extensions after the base RAG ships
7. Everything else — pick by user feedback

---

## 1. Promotions — deferred slices

### 1a. Creator-side "Create promotion" form

Why deferred — admin review flow shipped first; creators need a UI to submit.
Dependencies — admin promotions flow merged.
Build estimate — ~6 hr.

```
Build the creator-side promotion submission flow per
`.claude/plans/backlog-slices.md` § 1a.

Branch: trunk → feat/promotions-creator-form

Schema (already exists, migration 0023):
  packages/shared/src/db/schema/promotions.ts

Build:
1. Page `/creator/promotions` — list of caller's promotions filtered by
   creator_id, grouped by status (pending/active/paused/expired/rejected)
2. Page `/creator/promotions/new` — form: promotion_type radio, content/
   listing/classroom picker (mutually exclusive — only one), banner image
   upload via existing /api/creator-content/upload, headline (≤100 chars),
   description (≤500), cta_text + cta_url, target_exams multi-select from
   exams table, target_subjects free-text array, budget_type (impressions|
   clicks|flat), budget_amount_inr, starts_at, ends_at
3. tRPC `promotion.createDraft` — caller-creator only, status='pending',
   creator_id from creator_profiles
4. tRPC `promotion.myPromotions` — list filtered to caller
5. tRPC `promotion.cancel` — own promotions only, sets status='rejected'
   with audit reason "creator-cancelled"

Existing patterns:
  - Creator-only mutations: see assignment.ts `requireCreatorProfile`
  - Banner image storage: file_uploads table + S3
  - Form layout: /creator/live-sessions/new

Explicitly NOT in scope:
  - Razorpay charge for budget — that's slice 1b
  - In-progress edit (only draft → submit, no later edits)
  - Performance metrics drilldown — admin sees those today

Acceptance:
  - Creator submits → status='pending', appears in admin pending tab
  - Creator's own list always reflects latest status from admin actions
  - Banner image survives validation + S3 round-trip

Honor `.claude/rules/dev-workflow.md` — do NOT start the dev server.
When done, commit and open a PR against the trunk.
```

### 1b. Razorpay charge for promotion budget

Why deferred — promotion creation worked without payment; charging is a separate concern.
Dependencies — 1a shipped; existing payment router pattern (`apps/api/src/trpc/routers/payment.ts`).
Build estimate — ~8 hr.

```
Wire Razorpay payment to promotion creation per
`.claude/plans/backlog-slices.md` § 1b.

Branch: trunk → feat/promotions-payment

Build:
1. After creator submits a promotion via promotion.createDraft, do NOT
   immediately set status='pending'. Instead:
   a. Create a payment_orders row (existing table) with order_type='promotion',
      reference_id=promotionId, amount=budget_amount_inr * 100 (paisa)
   b. Return Razorpay order_id to the client
   c. Client opens Razorpay checkout with the existing RazorpayCheckout
      component (see apps/web/src/components/razorpay-checkout.tsx)
2. On payment.verify webhook for order_type='promotion':
   a. Update promotion status='pending' (now eligible for admin review)
   b. Update payment_orders.status='completed'
3. If payment fails or user abandons → promotion stays in
   status='draft' (new status — add via a small migration), and creator
   can retry via "Pay & submit" button on the draft row

Existing patterns:
  - Payment flow: apps/api/src/trpc/routers/payment.ts createOrder/verify
  - Webhook: apps/web/src/app/api/webhooks/razorpay/route.ts
  - Discriminated order_type: payment_orders.order_type column

Migration:
  - Add 'draft' to promotion status check constraint
  - No new columns needed

Explicitly NOT in scope:
  - Refunds for rejected promotions — admin must process manually or
    a separate refund slice
  - Variable budget bidding (impression auctions) — flat-priced for now

Acceptance:
  - Creator can't submit promotion without payment
  - Admin only sees paid (status='pending') promotions in their queue
  - Failed/abandoned payments leave a draft + a payment_orders row
    flagged 'failed' for audit

Honor the migration snapshot warning. Do NOT start the dev server.
```

### 1c. Public-facing banner display surface

Why deferred — no display surface meant active promotions had no rendering.
Dependencies — 1a shipped (active promotions exist).
Build estimate — ~6 hr.

```
Build the public banner display surface per
`.claude/plans/backlog-slices.md` § 1c.

Branch: trunk → feat/promotions-display

Build:
1. tRPC publicProcedure `promotion.activeForSurface({ surface, examId? })`:
   - surface: 'home' | 'exam_listing' | 'creator_directory' | 'classroom_join'
   - WHERE status='active' AND now() BETWEEN starts_at AND ends_at
   - Filter by target_exams if provided
   - Order: weighted random (banner > featured > sponsored), tie-break by
     budget_amount_inr DESC
   - Return up to N active promotions (default 3 for home, 1 for inline)
2. New component `apps/web/src/components/promotions/promotion-banner.tsx`:
   - Renders banner_image_url + headline + cta button
   - Fires impression-tracking pixel on mount (slice 1d)
   - Fires click-tracking on CTA (slice 1d)
3. Mount on:
   - /home (top banner, surface='home')
   - /exams (sidebar, surface='exam_listing')
   - /creators (sidebar, surface='creator_directory')
   - Classroom join confirmation page

Explicitly NOT in scope:
  - Real-time bidding / dynamic ranking — fixed weights for now
  - Frequency capping per user — can add later
  - A/B testing of banners — separate slice

Acceptance:
  - Banner renders without auth; lazy-loaded image; <100ms cumulative LCP impact
  - Empty state: surface gracefully renders nothing if no active promos
  - Mobile responsive: banner shrinks to 60px height, retains CTA

Honor `.claude/rules/dev-workflow.md`. Do NOT start the dev server.
```

### 1d. Impression + click tracking

Why deferred — display surface didn't exist, so no events to track.
Dependencies — 1c shipped.
Build estimate — ~4 hr.

```
Add impression/click tracking endpoints per
`.claude/plans/backlog-slices.md` § 1d.

Branch: trunk → feat/promotions-tracking

Build:
1. Next.js route handlers (NOT tRPC — these are fire-and-forget pixels):
   apps/web/src/app/api/promotions/track/route.ts
     POST { promotionId, event: 'impression' | 'click', surface }
   - Cookie-based dedup: same user + same promo + same hour = 1 impression
   - Async UPDATE promotions SET impressions = impressions + 1 (or clicks)
   - Return 204 No Content immediately, do work in waitUntil()
2. Update promotion-banner.tsx (slice 1c):
   - useEffect on mount: fetch('/api/promotions/track', ...) with event=impression
   - onClick of CTA: navigator.sendBeacon for event=click before navigation
3. tRPC `promotion.getMetrics({ promotionId })` (admin or owner):
   - Return impressions, clicks, conversions, CTR%, spent_amount_inr
   - Add per-day rollup join (use sql`date_trunc('day', ...)`)

Schema:
  - No new columns. Use existing impressions/clicks/conversions on promotions.
  - Optional: new `promotion_events` table (id, promo_id, event_type,
    user_id, surface, created_at) for fine-grained analytics. Not required
    for MVP — defer to a sub-slice if metrics dashboard needs it.

Explicitly NOT in scope:
  - Conversion tracking (e.g. "click → enrolled in classroom") — separate slice
  - Bot/CAPTCHA filtering — basic cookie dedup only

Acceptance:
  - Impressions counted within ±5% of actual page views
  - Click rate cleanly visible to admin and to creator (slice 1a list)
  - No measurable LCP regression from tracking pixel

Do NOT start the dev server. Honor migration warnings.
```

---

## 2. Creator analytics — deferred slices

### 2a. Real-time updates / websockets

Why deferred — initial dashboard is poll-based via TanStack Query.
Dependencies — creator analytics dashboard shipped.
Build estimate — ~8 hr.

```
Add real-time updates to /creator/analytics per
`.claude/plans/backlog-slices.md` § 2a.

Branch: trunk → feat/creator-analytics-realtime

Build:
1. New Fastify WS plugin at apps/api/src/ws/creator-analytics.ts using
   @fastify/websocket. Connection at ws://api/ws/creator-analytics
   authenticates via the existing JWT cookie.
2. Server emits events on:
   - New content_view inserted → emit 'view'
   - New creator_earnings inserted → emit 'earning'
   - New follower → emit 'follower'
3. Client hook useCreatorAnalyticsLive() subscribes, debounces 5s, and
   invalidates the relevant TanStack Query caches.
4. Add a small "● Live" pulse badge to /creator/analytics header showing
   connection state.

Explicitly NOT in scope:
  - Real-time student-side dashboards
  - Live attendee count for live sessions (separate slice — see live-sessions docs)

Acceptance:
  - Creator opens dashboard, another tab posts a view → KPI counter
    increments within 5s without manual refetch
  - Reconnects automatically after 30s drop
  - Falls back to polling if WS connection rejected

Do NOT start the dev server.
```

### 2b. Export creator analytics to CSV

Why deferred — read-only dashboard sufficient for MVP.
Dependencies — creator analytics dashboard shipped.
Build estimate — ~3 hr.

```
Add CSV export for creator analytics per
`.claude/plans/backlog-slices.md` § 2b.

Branch: trunk → feat/creator-analytics-export

Build:
1. tRPC `creatorAnalytics.exportCsv({ kind: 'revenue' | 'views' | 'classrooms', days })`:
   - Returns CSV string (or signed S3 URL for large exports)
   - Server-side: build CSV via simple string concat (no library)
   - Header row + data rows; UTF-8 BOM for Excel compatibility
2. Add "Download CSV" button on each tab of /creator/analytics:
   - Triggers a download via Blob + URL.createObjectURL
   - Filename: `examforge-{kind}-{YYYY-MM-DD}.csv`

Explicitly NOT in scope:
  - PDF reports — defer; complexity not worth it for early users
  - Scheduled email reports

Acceptance:
  - CSV opens cleanly in Excel + Google Sheets without character corruption
  - Numeric fields stay numeric (no leading apostrophes)
  - Date fields ISO 8601

Do NOT start the dev server.
```

### 2c. Per-classroom student leaderboard

Why deferred — engagement gamification is a separate UX direction.
Dependencies — exam_sessions + content_views populated.
Build estimate — ~6 hr.

```
Build a per-classroom student leaderboard per
`.claude/plans/backlog-slices.md` § 2c.

Branch: trunk → feat/classroom-leaderboard

Build:
1. tRPC `classroom.leaderboard({ classroomId, period: 'week' | 'month' | 'all' })`:
   - Caller must be teacher OR active member of the classroom
   - Aggregate: per-student watch_minutes (from content_views joined to
     creator_content WHERE assignedClassrooms includes classroomId) +
     assignment_submissions count + exam scores avg
   - Composite score: views*1 + submissions*5 + avg_score*0.1
   - Return top 50, ordered by score desc, with student name + avatar
2. New tab "Leaderboard" on /creator/classrooms/[id] (creator view) and
   /dashboard/classrooms/[id] (student view, with "you" highlighted)
3. Respect classrooms.settings.showLeaderboard flag — hide tab if false

Explicitly NOT in scope:
  - Cross-classroom rankings
  - Badges / achievements
  - Per-subject breakdown

Acceptance:
  - Leaderboard reflects last 24h of activity within 1 minute
  - Privacy: tab hidden when settings.showLeaderboard=false
  - Empty state: shows "No activity yet" gracefully

Do NOT start the dev server.
```

### 2d. Student "my progress" analytics

Why deferred — creator analytics shipped first; mirror analog for students.
Dependencies — content_views, exam_sessions populated.
Build estimate — ~8 hr.

```
Build the student-side progress dashboard per
`.claude/plans/backlog-slices.md` § 2d.

Branch: trunk → feat/student-progress

Build:
1. tRPC `studentProgress.overview()` and `studentProgress.byExam({ examId })`:
   - watchMinutesByDay (last 30) — content_views grouped by day
   - assignmentCompletion — % graded vs submitted vs pending
   - examScoreTrend — exam_sessions ordered by completed_at
   - subjectBreakdown — minutes per subject across all classrooms
2. Page /dashboard/progress with tabs: Overview, Per-exam, Per-classroom,
   Time-spent
3. Charts: line for watch minutes, bar for subject mix, donut for
   assignment completion. Use existing charts lib if any; otherwise
   recharts.
4. Add nav entry under Studies group: "My Progress", icon TrendingUp

Explicitly NOT in scope:
  - Predicted scores / ML insights — separate slice
  - Comparative benchmarks vs peers — privacy concerns, defer
  - Goal setting / streaks UI — gamification, separate UX track

Acceptance:
  - Numbers reconcile with creator analytics for the same data points
  - Empty states render gracefully when student has no exam history
  - Mobile-friendly (charts collapse cleanly)

Do NOT start the dev server.
```

---

## 3. Public creator directory — deferred slices

### 3a. Follow / unfollow

Why deferred — directory works without social graph.
Dependencies — creator_profiles + a creator_follows table (new).
Build estimate — ~6 hr.

```
Add follow/unfollow per `.claude/plans/backlog-slices.md` § 3a.

Branch: trunk → feat/creator-follows

Migration:
  packages/shared/src/db/schema/creator-follows.ts
    id uuid pk, follower_user_id fk users, creator_id fk creator_profiles,
    created_at, UNIQUE(follower_user_id, creator_id)

Build:
1. tRPC creator.follow / unfollow / isFollowing / followers / following
2. Wire the existing "Follow" button on /creators/[slug] hero — currently
   a no-op. Add count animation on follower_count.
3. On follow → trigger BullMQ job to increment creator_profiles.follower_count
   atomically (or use sql`+1` directly — atomic in pg).
4. New page /dashboard/following — list of followed creators with their
   latest content, sorted newest first.

Explicitly NOT in scope:
  - Notifications when followed creator publishes new content
  - Email digests
  - Mutual / friend graph

Acceptance:
  - Follow → counter +1, button flips to "Following" state
  - Idempotent (re-clicking Follow doesn't duplicate)
  - Unfollow doesn't decrement below 0 (clamp)

Honor migration snapshot warning. Do NOT start the dev server.
```

### 3b. Creator blog / social feed

Why deferred — adjacent product surface, not core to early KPIs.
Dependencies — creator_profiles, optional creator_follows.
Build estimate — ~12 hr.

```
Build creator-side blog/social feed per
`.claude/plans/backlog-slices.md` § 3b.

Branch: trunk → feat/creator-feed

Migration:
  creator_posts (id, creator_id, content_md, image_urls jsonb[],
  visibility 'public' | 'followers', view_count, like_count, created_at)
  creator_post_likes (post_id, user_id, created_at, unique)

Build:
1. tRPC creatorPost.{create, listByCreator, myFeed, like, unlike}
2. /creator/posts (creator dashboard) — compose + list own posts
3. /creators/[slug]/posts — public per-creator feed
4. /dashboard/feed — aggregated feed of followed creators (requires 3a)
5. Markdown rendering with existing markdown-message component

Explicitly NOT in scope:
  - Comments — separate slice
  - Reposts / quotes
  - Polls
  - Video posts — link out to creator_content for now

Acceptance:
  - Compose with markdown preview
  - Image upload via existing file_uploads pipeline
  - Visibility toggle respected: 'followers' hidden from non-followers

Honor migration warnings. Do NOT start the dev server.
```

### 3c. Creator-to-creator messaging

Why deferred — moderation overhead; not a flagship feature.
Dependencies — creator_profiles.
Build estimate — ~10 hr.

```
Build DM messaging between creators per
`.claude/plans/backlog-slices.md` § 3c.

Branch: trunk → feat/creator-dms

Migration:
  creator_dm_threads (id, creator_a_id, creator_b_id [a_id < b_id],
                      last_message_at, created_at, unique pair)
  creator_dm_messages (id, thread_id, sender_creator_id, content,
                       attachment_url, read_at, created_at)

Build:
1. tRPC creatorDm.{listThreads, getThread, sendMessage, markRead}
2. /creator/messages — thread list + active thread pane
3. Real-time via the WS plugin from slice 2a (reuse the connection)
4. Rate limit: 50 messages/hr per creator
5. Block/report: minimal — block stores the pair in a creator_dm_blocks table

Explicitly NOT in scope:
  - Group DMs
  - File attachments beyond images (single image per message)
  - End-to-end encryption — server-side plaintext for now (legal review needed)
  - Search across DMs

Acceptance:
  - 1-on-1 only
  - Receipts: read_at populated when other party views thread
  - Block prevents new messages (existing thread locks)

Honor migration warnings. Do NOT start the dev server.
```

### 3d. Sitemap for SEO

Why deferred — flagged for a generic sweep.
Dependencies — none.
Build estimate — ~3 hr.

```
Generate sitemap.xml for SEO per `.claude/plans/backlog-slices.md` § 3d.

Branch: trunk → feat/sitemap

Build:
1. apps/web/src/app/sitemap.ts (Next.js convention) — returns array of
   { url, lastModified, changeFrequency, priority } entries for:
   - / and key static pages
   - Every published creator: /creators/[slug]
   - Every published exam: /exams/[id]
   - Every published creator content: /creator/content/[id] (if public)
2. apps/web/src/app/robots.ts — allow all, point to sitemap
3. Cap to 50K URLs per file (Next.js handles split automatically if needed)

Explicitly NOT in scope:
  - Image sitemaps
  - Video sitemaps
  - News sitemaps

Acceptance:
  - /sitemap.xml returns valid XML and validates at validator.w3.org
  - Includes the 5–10 highest-traffic pages by content type
  - Cached at the edge for 1 hour
```

---

## 4. Subscription pool — deferred slices

### 4a. Razorpay payout integration

Why deferred — subscription pool computed shares but never paid them out.
Dependencies — subscription pool worker shipped; Razorpay Route account.
Build estimate — ~12 hr (high — payout testing is slow).

```
Wire creator payout via Razorpay Route per
`.claude/plans/backlog-slices.md` § 4a.

Branch: trunk → feat/creator-payouts

Migration:
  creator_payout_methods (id, creator_id, razorpay_fund_account_id,
                          account_type 'bank' | 'vpa', verified, created_at)
  creator_payouts (id, creator_id, amount_inr, status 'pending' | 'processing'
                   | 'paid' | 'failed', razorpay_payout_id, idempotency_key,
                   payout_period_month, requested_at, paid_at, failure_reason)

Build:
1. tRPC creatorPayout.{linkBank (form for IFSC + account number), verify,
                       request (manual), history}
2. BullMQ job: monthly payout — pick all creators with
   wallet.balance_inr >= min_payout_inr (creators.min_payout_inr flag),
   create payout via Razorpay API, update creator_wallets atomically
3. Webhook /api/webhooks/razorpay-payout — handle payout.processed,
   payout.failed events. On failure, restore wallet balance.
4. Admin /admin/payouts — review/approve/reject manually triggered payouts

Compliance:
  - PAN required for >₹50K/year payouts (KYC flag in creator_profiles)
  - Razorpay handles GST invoicing if creator has GSTIN

Explicitly NOT in scope:
  - International payouts (Wise/PayPal) — INR only
  - Crypto / non-banking rails
  - Tax (TDS) deduction — Razorpay X handles 1% TDS automatically

Acceptance:
  - Test mode: payout request → wallet decrement → mock success → record updated
  - Failure path: webhook updates record + restores wallet (no double-spend)
  - Idempotency_key prevents duplicate payout API calls

Honor migration warnings. Do NOT start the dev server.
```

### 4b. Subscription tier multipliers

Why deferred — flat distribution shipped; tier weighting is a refinement.
Dependencies — subscriptions table (existing) with tier column.
Build estimate — ~4 hr.

```
Add tier multipliers to subscription pool weighting per
`.claude/plans/backlog-slices.md` § 4b.

Branch: trunk → feat/subscription-pool-tiers

Build:
1. Update apps/api/src/services/subscription-pool.ts computeCreatorScores:
   - Look up the viewer's subscription tier at view-time (from
     content_views.metadata.tier or join to subscriptions)
   - Multiplier: free=1.0, premium=2.0, vip=3.0
   - weighted_score = sum(view_count_per_tier * tier_multiplier)
2. Store tier multiplier in subscription_pool.breakdown jsonb for audit
3. Update Vitest fixtures to cover multi-tier scenarios

Explicitly NOT in scope:
  - Time-of-day multipliers (peak hours)
  - Subject-difficulty multipliers
  - Geographic multipliers

Acceptance:
  - 100 free views + 50 premium views = same weight as 200 free views
  - Tests deterministic with fixed multipliers
  - Backwards compatible: old period months without tier data treated as free
```

### 4c. Cross-currency support

Why deferred — INR-only platform for now.
Dependencies — currency column wherever amounts live.
Build estimate — ~6 hr but fanout across many tables; do as part of bigger i18n push.

```
Add multi-currency support per `.claude/plans/backlog-slices.md` § 4c.

Defer until international launch. Touchpoints will include: wallets,
earnings, payouts, payment_orders, subscriptions, marketplace_listings.
Each table needs currency_code (ISO 4217) and amount stored as integer
(smallest unit) to avoid float math. Build estimate is high (16+ hr) due
to fanout — bundle with the i18n / international expansion phase.
```

### 4d. Email notifications to creators

Why deferred — generic notification infra missing.
Dependencies — Resend already wired (apps/api/src/services/email).
Build estimate — ~4 hr.

```
Send email notifications when subscription pool distributes per
`.claude/plans/backlog-slices.md` § 4d.

Branch: trunk → feat/subscription-pool-emails

Build:
1. Inside subscription-pool-worker, after distributePool succeeds, queue
   one email per creator with status='available' earnings:
   - Subject: "₹X earned from ExamForge in {month}"
   - Body: breakdown summary + link to /creator/wallet
2. Use existing Resend service. Throttle to 10/sec to respect Resend limits.
3. Respect users.notification_prefs.email_earnings (new column? add via
   migration, default true)

Explicitly NOT in scope:
  - In-app notifications — use this slice as a foundation, but defer
  - SMS notifications — out of scope for monetary updates
  - Customizable email templates per creator

Acceptance:
  - Email contains accurate ₹ amount + period_month
  - Unsubscribe link respects prefs
  - Failed sends logged but don't fail the pool distribution

Honor migration warnings. Do NOT start the dev server.
```

---

## 5. Live sessions — deferred slices

### 5a. Push notifications when session goes live

Why deferred — needs FCM/APNS infra that the platform doesn't have yet.
Dependencies — generic push notification infra (TBD).
Build estimate — ~10 hr including infra.

```
Add push notifications when a live session starts per
`.claude/plans/backlog-slices.md` § 5a.

Branch: trunk → feat/live-sessions-push

Prereq:
  Web Push (VAPID) for browser; FCM for mobile (when mobile ships).
  This slice ships the Web Push half.

Migration:
  push_subscriptions (id, user_id, endpoint, p256dh, auth, ua, created_at)

Build:
1. apps/web/src/components/push-subscribe-prompt.tsx — modal asking
   permission, registers service worker, posts subscription to API
2. tRPC pushSubscription.{register, unregister}
3. New BullMQ queue 'web-push' with apps/api/src/services/web-push.ts
   wrapper around web-push npm
4. live-session.markJoined transition (scheduled → live) ALSO enqueues
   a web-push job per active member of the session's classroom
   (and per following user if standalone)

Env vars:
  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (npm web-push generate-vapid-keys)
  Add VAPID_PUBLIC_KEY to NEXT_PUBLIC_* allowlist

Explicitly NOT in scope:
  - In-app live notification toasts — separate slice
  - Email "going live" reminders
  - SMS reminders

Acceptance:
  - Student grants permission → row in push_subscriptions
  - Creator opens session → all subscribed members get push within 5s
  - Click push → opens /dashboard/live or /dashboard/classrooms/[id]/live

Honor migration warnings. Do NOT start the dev server.
```

### 5b. Calendar integration (.ics export)

Why deferred — small, would have bloated the initial slice.
Dependencies — none.
Build estimate — ~2 hr.

```
Add .ics export for live sessions per
`.claude/plans/backlog-slices.md` § 5b.

Branch: trunk → feat/live-sessions-ics

Build:
1. Next.js route handler GET /api/live-sessions/[id]/ics:
   - Verify caller has access (reuse requireSessionAccess logic)
   - Build VCALENDAR string with UID = session.id, DTSTART, DTEND,
     SUMMARY, DESCRIPTION + meeting URL, ORGANIZER (creator email)
   - Set Content-Type: text/calendar; charset=utf-8
   - Filename via Content-Disposition: examforge-{title-slug}.ics
2. Add "Add to calendar" button on:
   - /creator/live-sessions/[id]
   - Each upcoming card on /dashboard/live
3. Optional: also export ALL upcoming as a feed at
   /api/live-sessions/feed.ics (for Google Cal / Outlook subscription URLs)

Explicitly NOT in scope:
  - Two-way Google Calendar sync — use Option B Zoom integration if needed
  - Recurring sessions
  - Reminders within the .ics

Acceptance:
  - .ics imports cleanly into Google Calendar, Apple Calendar, Outlook
  - Time zone correct (use IANA tz from creator_profiles or default Asia/Kolkata)
  - Subscription URL refreshes on schedule changes

Do NOT start the dev server.
```

### 5c. Paid live sessions checkout flow

Why deferred — paid sessions list but block the join button until checkout exists.
Dependencies — Razorpay payment router (existing).
Build estimate — ~6 hr.

```
Wire paid live-session checkout per
`.claude/plans/backlog-slices.md` § 5c.

Branch: trunk → feat/live-sessions-paid-checkout

Build:
1. New table: live_session_purchases (id, session_id, user_id, amount_inr,
   payment_order_id, status, purchased_at, unique session+user pair)
2. tRPC liveSession.purchase({ sessionId }) — creates payment_orders row
   with order_type='live_session', returns Razorpay order_id
3. Webhook handler updates live_session_purchases.status='completed' on
   payment.captured. THIS is the unlock signal for markJoined.
4. Update markJoined: for !is_free sessions, require a completed
   purchase row. Replace the current "Paid (coming soon)" block.
5. UI: Join button on paid session cards opens RazorpayCheckout if not
   purchased; otherwise the existing join flow

Revenue split:
  - Platform: 30% (or use creators.classroom_platform_fee_percent)
  - Creator: 70%
  - Recorded as creator_earnings on payment success

Explicitly NOT in scope:
  - Refunds (creator-initiated) — separate slice
  - Group discounts / bulk codes
  - Subscription-bundled access (covered by subscription pool)

Acceptance:
  - Buy → join works in test mode
  - Already-purchased = no double charge
  - Failed payment = no purchase row, can retry

Honor migration warnings. Do NOT start the dev server.
```

### 5d. Live chat overlay

Why deferred — would have required either real-time infra or external chat embed.
Dependencies — WS plugin from slice 2a OR external chat service.
Build estimate — ~10 hr (custom) or ~4 hr (external).

```
Add live chat to live sessions per `.claude/plans/backlog-slices.md` § 5d.

Branch: trunk → feat/live-sessions-chat

Decision required first:
  A) Build on top of slice 2a's WS infra (custom, ~10 hr)
  B) Embed an external chat (e.g. Stream Chat) iframe (~4 hr but $$ /MAU)
  C) Defer to Option C (embedded video) — most embedded SDKs include chat

Recommendation: defer to whichever live-sessions option (B or C) ships
next. Only build standalone chat if neither B nor C are scheduled.

If standalone (Option A):
  Migration:
    live_session_messages (id, session_id, user_id, content, created_at)
  Build:
    - WS topic 'live-session/{id}' subscribed by attendees
    - Insert message → broadcast to topic
    - Side-panel UI on /dashboard/live (Option A still uses external link,
      so chat would need to be in a popup window — probably not worth it)

Verdict: low priority for Option A. Build only if Options B and C are
indefinitely deferred.
```

---

## 6. AI tutor / RAG — deferred slices

### 6a. Cross-classroom search

Why deferred — keeps citations grounded per-classroom; cross-search needs
a global RAG infra.
Dependencies — base AI tutor RAG shipped.
Build estimate — ~6 hr.

```
Allow AI tutor to search across all enrolled classrooms per
`.claude/plans/backlog-slices.md` § 6a.

Branch: trunk → feat/ai-tutor-cross-classroom

Build:
1. tRPC aiTutor.askGlobal({ query }) — same as ask but candidate set is
   ALL creator_content where any of the user's classrooms have it assigned
2. /dashboard/ai-tutor (no classroom param) — global tutor surface
3. Add "Switch to global search" toggle inside per-classroom AI Tutor tab

Explicitly NOT in scope:
  - Cross-user content (only enrolled classrooms)
  - Public content not in your classrooms

Acceptance:
  - Global queries return citations with classroom name attached
  - Per-classroom queries unaffected (existing behavior)
  - Same Redis 24h cache key prefix differentiator
```

### 6b. Voice input

Why deferred — extra dimension on top of base text RAG.
Dependencies — base AI tutor; existing voice-tutor infra (Azure Speech).
Build estimate — ~6 hr.

```
Add voice input to AI tutor per `.claude/plans/backlog-slices.md` § 6b.

Branch: trunk → feat/ai-tutor-voice

Build:
1. Reuse the existing voice-tutor STT pipeline (Azure Speech) — wrap in
   a Mic component for the AI tutor chat input
2. Press-and-hold mic button → record → transcribe → fill chat input
3. Optional TTS playback of AI answer (use existing Azure voices)

Existing infra:
  - Azure Speech key in admin settings (voice.azure_speech_key)
  - apps/api/src/services/tts/* for TTS
  - Voice tutor router may have STT helpers — reuse

Explicitly NOT in scope:
  - Continuous voice mode (always-on) — separate slice
  - Whisper-based local STT
  - Voice biometric auth

Acceptance:
  - Voice input works on Chrome / Safari / Edge
  - Falls back gracefully if mic permission denied
  - Respects voice.per_user_char_limit

Do NOT start the dev server.
```

### 6c. Image input (handwritten doubt photos)

Why deferred — needs OCR + multimodal AI; high build cost for early users.
Dependencies — base AI tutor; OCR service.
Build estimate — ~10 hr.

```
Add image input to AI tutor per `.claude/plans/backlog-slices.md` § 6c.

Branch: trunk → feat/ai-tutor-image-input

Build:
1. Chat input gets paperclip → upload image (HEIC + JPG + PNG)
2. Pipeline:
   a. Run OCR via existing apps/api/src/services/ocr (Gemini-based)
   b. Detect domain: math (LaTeX) vs handwritten text vs printed text
   c. For math: render extracted LaTeX in chat for confirmation
   d. Pass extracted text + image to Claude Sonnet (multimodal)
   e. Stream answer with citations
3. Store image in S3 (private), reference in ai_tutor_messages.attachments
   jsonb

Cost guard:
  - Limit to 10 image questions per student per day (configurable flag)
  - Rate-limit at the API level

Explicitly NOT in scope:
  - Video input
  - Multi-image questions in one prompt (just one image per turn)
  - Solving from screenshot of textbook (copyright concerns)

Acceptance:
  - Handwritten algebra question → correct OCR within 80% of cases
  - Printed text MCQ photo → answers correctly
  - Image too large/blurry → graceful "I couldn't read this" reply
```

### 6d. Quiz generation from chat history

Why deferred — natural extension; not core to MVP.
Dependencies — base AI tutor + ai_tutor_conversations table.
Build estimate — ~6 hr.

```
Generate quiz from a tutor conversation per
`.claude/plans/backlog-slices.md` § 6d.

Branch: trunk → feat/ai-tutor-quiz

Build:
1. Button "Quiz me on this" inside an open AI Tutor conversation
2. tRPC aiTutor.generateQuiz({ conversationId, count: 5 }):
   - Gather last N messages
   - Prompt Claude to extract testable concepts and produce MCQ JSON
   - Validate via existing QuestionSchema (Instructor.js pattern)
   - Insert into questions table with source='ai_tutor', visibility='private'
3. Redirect to /dashboard/learn with the freshly generated questions

Explicitly NOT in scope:
  - Adaptive difficulty
  - Spaced repetition scheduling (defer; existing exam_sessions covers
    practice mode)
  - Subjective questions

Acceptance:
  - 5 valid MCQs in <10s
  - Questions reference cited content from the conversation
  - Quiz is saveable and re-takeable from /dashboard/learn

Do NOT start the dev server.
```

---

## Closing notes

- Each prompt is self-contained — paste one into a fresh Claude Code
  session and the agent has everything needed to ship that slice.
- When a slice is built, check it off here by adding **(Done — PR #XX)**
  next to the title and remove it from the suggested build order.
- This file is a living backlog; update freely as priorities shift.
- For brand-new feature ideas (not derived from a previous "out of scope"
  list), add a new entry following the same template:
  `### N. Title` → why deferred → dependencies → build estimate → prompt.
