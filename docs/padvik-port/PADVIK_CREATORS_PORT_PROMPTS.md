# PadVik Creators — Port Prompts (Additive)

Self-contained prompts to port the full Creators ecosystem onto **PadVik**
without breaking what PadVik already ships. Paste one section into a fresh
Claude Code session **inside the PadVik repo**
(`E:\DEVELOPMENT\WEBSITE\ENSATE\INHOUSE\PadVik\PadVikProject`).

- **Companion spec:** `PADVIK_CREATORS_PORT_SPEC.md` (read its §0 Golden Rule).
- **Reference implementation:** ExamForge `docs/features/CREATORS_COMPLETE_SPEC.md`
  - `.claude/plans/next-session-prompts.md` (these slices are proven there).
- **Run order:** Prompt 0 first (it gates everything), then P1 → P7 as the
  gap report allows. Do NOT run a build slice before its gap is confirmed.

---

## Universal heads-up (paste at the TOP of every PadVik session)

> **Golden Rule (non-negotiable):** additive only. (1) Audit before you add —
> never assume something is missing. (2) New tables free; existing tables get
> **nullable, defaulted** new columns only — no rename/drop/retype. (3) New
> routes/pages/workers at new paths; never change an existing endpoint's
> behaviour, shape, or auth. (4) Every new surface behind a feature flag,
> default OFF. If a step would break an existing feature, STOP and report.
>
> **PadVik specifics to confirm in the audit, then honour:**
>
> - PK convention is **BIGINT** (not UUID). Translate every PK/FK.
> - Domain is **board/class/subject/chapter** (school), not competitive exam.
>   Map ExamForge `exam_id/syllabus_id/syllabus_node_id` → PadVik's real FKs.
> - Reuse PadVik's existing auth guard, payment client, storage/CDN helper,
>   queue factory, AI router, and AI-usage cost log. Do not fork parallel copies.
>
> **Migrations:** one additive migration per slice, generated off PadVik's
> current head. `ADD COLUMN ... NULL` / `CREATE TABLE IF NOT EXISTS`. Never
> re-emit an old migration; never drop/rename/retype a live column.
>
> **Definition of done for every slice:** the slice's flag is OFF, every
> pre-existing creator feature still behaves identically (regression-check),
> typecheck/lint/tests pass, and the gap matrix from Prompt 0 is updated.
>
> **Dev-server rule (if PadVik mirrors ExamForge's):** make code changes,
> commit, and merge — the user runs/debugs the app themselves. Ask before
> starting a dev server.

---

## Prompt 0 — Audit & Gap Report (NO code changes)

```
Produce a Creators-ecosystem gap report for PadVik. This is read-only — make
NO code or schema changes. Output a single markdown report.

Read PADVIK_CREATORS_PORT_SPEC.md first (especially §0 Golden Rule and §1).

Inventory and record:
1. Stack & conventions: framework, API layer, ORM, PK convention (confirm
   BIGINT), migration tool + current migration head, auth guard, payment
   client, object storage + CDN helper, queue system, AI router, AI-usage
   cost-log table.
2. Domain mapping: the real column/table names for board / class / subject /
   chapter that replace ExamForge's exam_id / syllabus_id / syllabus_node_id.
3. For EACH table in PADVIK_CREATORS_PORT_SPEC.md §3, mark present / partial /
   absent. For "partial", list exactly which spec columns are missing.
4. Existing creator routes/pages (registration, profile, content upload,
   classrooms, doubts, marketplace, earnings, promotions, live, analytics,
   directory).
5. Existing workers (media/transcode/OCR/transcription, settlement, embeddings).
6. Existing feature flags related to creators.

Deliver a matrix: `Feature | PadVik state | Action (reuse / extend-additively /
add-new) | Notes`. Then list the recommended slice order for THIS codebase,
flagging any slice whose prerequisite (e.g. pgvector for RAG, Razorpay for
marketplace) is missing.

Write the report to docs/padvik-port/PADVIK_GAP_REPORT.md. Do not modify any
other file.
```

---

## Prompt 1 — Additive profile + content + upload deltas (P1)

```
Bring PadVik's creator_profiles / creator_content / file_uploads up to the
spec, additively. Read PADVIK_GAP_REPORT.md — only add columns it marked
missing.

Golden Rule applies: nullable+default columns only on existing tables; new
tables via CREATE TABLE IF NOT EXISTS; map exam/syllabus FKs to PadVik board
FKs; everything reachable only behind creators.enabled.

Build:
1. Additive migration: add the missing creator_profiles columns (creator_tier,
   verification_status, kyc_*, payout_*, cached counters, promotional fields,
   is_featured, slug). Add the missing creator_content media/AI columns
   (media_url, thumbnail_url, duration_seconds, ai_* , upload_status,
   verification_*, review_status). Add file_uploads.processed_variants if absent.
2. Extend (do not replace) the existing profile + content-upload endpoints to
   read/write the new fields as OPTIONAL — existing callers must be unaffected.
3. Support text + document + image upload paths (reuse PadVik's storage helper).

NOT in scope: marketplace, video transcode, classrooms.
Acceptance: with creators.enabled OFF the app is byte-for-byte unchanged;
with it ON, profiles/content expose the new fields; no existing column altered.
```

---

## Prompt 2a — Creator analytics dashboard (P2, read-only)

```
Add a read-only creator analytics dashboard to PadVik. NO schema changes.
Mirror ExamForge's creator-analytics slice (.claude/plans/next-session-prompts.md
§2 in the ExamForge repo for reference).

Data sources: existing creator_profiles counters, creator_content per-item
stats, content_views (date_trunc rollups), creator_earnings, creator_wallets,
classrooms, doubts. All queries creator-scoped (derive creatorId from the
caller; copy PadVik's existing creator-scope helper).

Build a creatorAnalytics API (overview, revenueByDay, viewsByDay, topContent,
classroomEnrollment, doubtStats) and a /creator/analytics page with tabs
(Overview KPIs + charts, Content table, Classrooms, Engagement). Filter state
in URL query params. Gate behind creators.enabled.

NOT in scope: CSV export, realtime, student-side analytics.
Acceptance: numbers cross-reference (wallet balance == sum available earnings);
clean empty states; no existing route touched.
```

## Prompt 2b — Public creator directory (P2, read-only)

```
Add a public creator directory to PadVik at /creators + /creators/[slug].
Needs ONE additive column if absent: creator_profiles.slug (nullable, unique;
backfill via PadVik's slugify). Otherwise read-only.

Build: listPublic (filter is_active + verified, sort featured/rating/newest,
search on display_name + specializations) and bySlug (profile + published
content + free classrooms). Public pages with SEO (generateMetadata or PadVik's
equivalent), filter sidebar, pagination via URL. Gate behind
creators.directory_enabled.

NOT in scope: follow/unfollow, messaging, sitemap.
Acceptance: renders without auth; featured pinned first; the slug migration is
purely additive; existing pages unaffected.
```

---

## Prompt 3 — Promotions admin flow (P3)

```
Add the admin review/management flow for creator promotions to PadVik.
If PadVik has no promotions table, add it (spec §3.6, board-mapped targeting);
if it has one, extend additively. No destructive changes.

Build: admin API (adminList by status, approve, reject w/ reason logged to
PadVik's admin audit log, pause, resume, getMetrics) using PadVik's admin
guard; and /admin/promotions with tabs (Pending|Active|Paused|Completed|
Rejected), table, approve/reject dialog, pause/resume, metrics drawer. Gate
behind creators.promotions_enabled.

NOT in scope: creator create-form (separate), public banner surface, billing.
Acceptance: all admin actions audit-logged; reject reason surfaced; no schema
column altered; admin nav link added without disturbing existing items.
```

---

## Prompt 4a — Subscription-pool distribution worker (P4)

```
Add the monthly subscription-pool distribution worker to PadVik. Schema
(subscription_pool, board-mapped) added only if absent. Reuse PadVik's queue
factory + worker bootstrap.

Logic in a service (keep the worker thin): computeMonthlyPool (70% of
subscription revenue for the period), computeCreatorScores (free_view_count*1 +
watch_minutes*0.5, capped 25%/creator), distributePool (idempotent via unique
(creator_id, period_month); inserts creator_earnings + increments wallet;
stores auditable breakdown JSONB). Repeatable monthly job + admin manual-run
button at /admin/subscription-pool. Gate behind creators.subscription_pool_enabled.

Tests (mandatory): fixtures with 3 creators; verify scores, exact pool sum (last
creator absorbs rounding), 25% cap, idempotency.
Acceptance: deterministic tests pass; re-run is a no-op; breakdown auditable;
no existing worker/route changed.
```

## Prompt 4b — Media OCR / transcription extensions (P4)

```
Extend PadVik's media pipeline additively. PadVik already has the handwritten
OCR pattern (buildOcrPrompt) — REUSE it, don't rewrite.

Add only what the gap report says is missing, each flagged:
- Video HLS transcode (creators.video_upload_enabled) + audio AAC
  (creators.audio_upload_enabled) if absent.
- Large-file video transcription (ExamForge §7a): Gemini File API OR ffmpeg
  audio-extract → existing audio chain. Pick per PadVik's deploy constraints.
- Auto-extract-on-publish (creators.auto_extract_on_publish, default OFF):
  on content publish, enqueue OCR for un-extracted docs/images and
  transcription for un-transcribed audio/video. Idempotent; respect ocr flag;
  mind cost (prefer per-upload opt-in).
Log every AI call to PadVik's usage table.

NOT in scope: changing existing OCR behaviour when the new flags are OFF.
Acceptance: with new flags OFF, current OCR/upload behaviour is identical.
```

---

## Prompt 5a — Classroom extensions (P5)

```
Extend PadVik's EXISTING classrooms additively (school context — classrooms
are core, so be especially careful). Read the gap report; add only missing
columns/tables.

Add (if absent): pricing (is_paid, fee_inr, billing_cycle), join_code, settings
JSONB, schedule/next_live_session; and the classroom_assignments +
assignment_submissions tables. Extend the classroom UI with Assignments tab and
per-classroom stats WITHOUT altering existing classroom flows. Paid classrooms
gated behind creators.paid_classrooms_enabled; reuse PadVik's payment client.

NOT in scope: rebuilding existing classroom CRUD; leaderboards.
Acceptance: existing classroom create/join/list behave identically with new
flags OFF; new columns nullable; no FK on a live table retyped.
```

## Prompt 5b — Doubts + live sessions (P5)

```
Add doubts (doubts, doubt_responses) and live sessions (live_sessions,
live_session_attendees) to PadVik if absent. Doubts: student asks, creator/AI
answers (AI auto-answer behind creators.ai_tutor_enabled). Live: schedule /
join / attendance / recording-url; port whichever provider (paste-URL / Zoom /
embedded) fits PadVik ops; paid gated by is_free. Flags: creators.doubts_enabled,
creators.live_sessions_enabled.

Acceptance: new tables only; both features invisible until flagged; existing
notifications/chat untouched.
```

---

## Prompt 6 — Marketplace + earnings (P6, only if PadVik lacks it)

```
ONLY run if the gap report marks marketplace as absent/partial. Add
marketplace_listings, marketplace_purchases, creator_wallets, creator_earnings,
content_ratings additively. Listing creation, purchase via PadVik's Razorpay
client, 70/30 split automation, wallet, payout (min payout flag, KYC flag),
ratings. Gate behind creators.marketplace_enabled.

Acceptance: money flow reuses PadVik's payment client (no parallel integration);
split + wallet math verified by tests; existing payment flows unchanged.
```

---

## Prompt 7 — Creator AI tutor (RAG) (P7)

```
Add the RAG-backed creator AI tutor to PadVik. PREREQUISITE from the gap
report: Postgres has pgvector. If not, STOP and report — do not proceed.

New schema (additive): content_embeddings (vector(1536), HNSW + btree on
content_id) and chat tables (reuse PadVik's chat tables if they fit; else add
ai_tutor_conversations / ai_tutor_messages). Pipeline: extract text (body +
OCR + transcript) → chunk → embed (reuse PadVik's embedding provider) →
upsert (idempotent). Background embedding worker on publish. ask() endpoint:
verify enrolment, top-k over the classroom's content, grounded Claude answer
with citations, "I couldn't find this in your materials" guardrail. Cache
identical queries 24h. Cost-log every embed + answer. Gate behind
creators.ai_tutor_enabled.

Acceptance: grounded answer < 3s with citations; out-of-scope question refuses
instead of hallucinating; re-query hits cache; embedding worker idempotent;
nothing runs until the flag is ON.
```

---

## Closing notes

- Each prompt is self-contained; the gap report (Prompt 0) is the shared
  dependency — keep it updated as slices land.
- Never let a port slice regress an existing PadVik feature. The regression
  check (every existing creator feature still works with new flags OFF) is part
  of every slice's Definition of Done.
- ExamForge proved this exact slice set end-to-end — when in doubt about a
  detail, read the matching ExamForge router/page as the reference
  implementation, then translate to PadVik's conventions (BIGINT, board
  mapping, PadVik's own abstractions).

```

```
