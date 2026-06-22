# PadVik Creators Ecosystem — Port Spec (Additive)

> **Purpose:** Bring PadVik's Creators ecosystem up to the full feature set
> already specified for ExamForge, **without breaking any creator feature
> PadVik already ships**.
> **Source of truth:** `docs/features/CREATORS_COMPLETE_SPEC.md` (ExamForge) +
> `.claude/plans/next-session-prompts.md` (the slice prompts that built it).
> **Company:** Ensate Technologies — Creators is shared architecture across
> PadVik + ExamForge. ExamForge's spec was itself _adapted from PadVik_; this
> document ports the now-superset feature set **back** to PadVik.
>
> **PadVik repo:** `E:\DEVELOPMENT\WEBSITE\ENSATE\INHOUSE\PadVik\PadVikProject`
> — copy this `docs/padvik-port/` folder into it, then run Prompt 0 there.
>
> **Read this whole section before touching anything →** The Golden Rule.

---

## 0. The Golden Rule — Additive, Non-Breaking, Flagged

PadVik already has _some_ of these features in production. Every change in
this port MUST obey all four:

1. **Audit before you add.** Never assume a table/route/worker is missing.
   Run the §1 pre-flight audit first and write the gap report. Build only
   what the audit proves is absent.
2. **Additive schema only.** New tables are free. For an _existing_ table
   (e.g. `creator_profiles` if PadVik already has it), only **add nullable
   columns with defaults** — never rename, drop, retype, or repurpose an
   existing column. No destructive migrations.
3. **New surfaces, untouched old ones.** Add new routes/pages/workers at new
   paths. Do not change the behaviour, response shape, or auth of an
   endpoint PadVik already serves. If you must extend an existing endpoint,
   add optional fields — existing callers must keep working unchanged.
4. **Everything behind a feature flag, default OFF.** Mirror ExamForge's
   `creators.*` flag set (§7). A flag that PadVik already has, reuse; a flag
   that's new, add it OFF. Nothing in this port becomes user-visible until a
   flag is flipped.

If a prompt's instruction ever conflicts with the Golden Rule, the Golden
Rule wins — stop and report instead of breaking an existing feature.

---

## 1. Mandatory Pre-Flight Audit (do this first, every time)

Before any slice, inventory PadVik and produce a **gap report**. The port
prompts (`PADVIK_CREATORS_PORT_PROMPTS.md`, Prompt 0) automate this, but the
checklist is here so the spec is self-contained.

Inventory and record, for PadVik:

- **Stack & conventions** — framework (Next/other), API layer (tRPC/REST/
  GraphQL), ORM (Drizzle/Prisma/other), PK convention (**PadVik uses BIGINT**,
  ExamForge uses UUID — translate accordingly), migration tool, auth, payments
  (Razorpay?), object storage (S3/other + CDN), queue (BullMQ/other).
- **Domain mapping** — PadVik is **board/grade/subject** focused (school
  exams), NOT competitive-exam focused. Map ExamForge's
  `exam_id / syllabus_id / syllabus_node_id` → PadVik's equivalents
  (`board_id / class_id / subject_id / chapter_id` or whatever exists). Record
  the real column names.
- **Existing creator tables** — which of the §3 tables already exist, and
  their current columns. Mark each table: `present` / `partial` / `absent`.
- **Existing creator routes/pages** — registration, profile, content upload,
  classrooms, doubts, marketplace, earnings, etc.
- **Existing workers** — media/transcode/OCR/transcription, settlement.
- **Existing feature flags** — which `creators.*` (or PadVik-named) flags exist.

Output a matrix: `Feature | PadVik state (present/partial/absent) | Action
(reuse / extend-additively / add-new)`. This matrix drives the whole port.

---

## 2. Target Feature Map (full end state)

Same capability set as ExamForge's spec, board-mapped for PadVik:

```
CREATOR TYPES        Individual teacher · Institute/coaching · Student creator · Publisher
CONTENT TYPES        Question sets · Notes/tutorials · Video · Audio · Documents (PDF/handwritten) ·
                     Images→OCR · Courses (bundles) · Promotional
INTERACTION          Classrooms · Doubt clearance · Creator AI tutor (RAG) · Live sessions ·
                     Community/comments · Ratings & reviews
MONETIZATION         Marketplace (70/30) · Subscription pool · Classroom fees · Tips ·
                     Promoted content · Referrals
```

Board mapping (replace ExamForge exam/syllabus everywhere):

| ExamForge concept   | PadVik concept (confirm exact names in audit) |
| ------------------- | --------------------------------------------- |
| `exam_id`           | `board_id` + `class_id` (e.g. CBSE, Class 10) |
| `syllabus_id`       | `subject_id` / `curriculum_id`                |
| `syllabus_node_id`  | `chapter_id` / `topic_id`                     |
| "exam-prep creator" | "subject/board teacher"                       |

---

## 3. Schema Additions (PadVik conventions)

> **Translate every PK/FK to BIGINT** (or PadVik's actual convention).
> Keep ExamForge's column _semantics_; only the types and the board-mapping
> FKs change. Full column lists live in `CREATORS_COMPLETE_SPEC.md` §2 —
> this section lists the tables and the **additive deltas** to watch.

For each table below: **if PadVik already has it, do NOT recreate** — diff its
columns against the spec and add only the missing ones (nullable + default).

### 3.1 Core (Phase A)

- `creator_profiles` — likely **already exists in PadVik**. Additive columns to
  check for: `creator_tier`, `verification_status`, `kyc_status/kyc_details`,
  payout fields (`payout_upi`, `payout_bank`, `pan_number`, `gst_number`),
  cached stat counters, promotional fields, `is_featured`, `slug` (needed for
  the public directory — see §5.10).
- `creator_content` — the **universal content table** (video|audio|note|
  document|question*set|image|course|live_session|promotional). If PadVik
  stores content type-per-table, add this as a new unifying table OR add the
  missing `content_type` discriminator + media/AI columns additively. Map
  `exam_id/syllabus*\*` → board FKs.
- `file_uploads` — S3 key, mime, size, `processed_variants` JSONB (HLS/AAC/
  thumbnail). Reuse PadVik's upload table if present; add `processed_variants`.
- `creator_followers`, `content_views` — additive; `content_views.credit_cost`
  feeds the subscription pool.

### 3.2 Classrooms (Phase C)

- `classrooms`, `classroom_members`, `classroom_assignments`,
  `assignment_submissions`. PadVik (school context) very likely **already has
  classrooms** — this is its core. **Extend, don't replace.** Add only missing
  columns (pricing: `is_paid`, `fee_inr`, `billing_cycle`; `join_code`;
  `settings`; `schedule`/`next_live_session`) and the assignment/submission
  tables if absent.

### 3.3 Doubts (Phase D)

- `doubts`, `doubt_responses` — student asks, creator/AI answers. Add if absent.

### 3.4 Live Sessions (Phase D)

- `live_sessions`, `live_session_attendees` — paste-URL / Zoom / embedded.
  ExamForge shipped all three providers; port whichever fits PadVik's ops.

### 3.5 Marketplace + Earnings (Phase B)

- `marketplace_listings`, `marketplace_purchases`, `creator_wallets`,
  `creator_earnings`, `content_ratings`, `subscription_pool`.

### 3.6 Promotions (Phase D)

- `promotions` — banner/featured/search-boost/homepage-card, budget, targeting
  (by board/class/subject instead of exam), impressions/clicks/conversions.

### 3.7 AI Tutor RAG (Phase D)

- `content_embeddings` (vector(1536), HNSW) + `ai_tutor_conversations` /
  `ai_tutor_messages` (or reuse PadVik's chat tables). Requires pgvector;
  confirm PadVik's Postgres has it before adding.

---

## 4. Additive Integration Rules (mechanics)

- **Migrations:** one additive migration per slice. `ADD COLUMN ... NULL`
  / `CREATE TABLE IF NOT EXISTS`. Never `DROP`/`ALTER ... TYPE`/`RENAME` on
  live tables. Generate off PadVik's current migration head; never re-emit
  an old one.
- **Reuse existing abstractions:** PadVik's auth guard, payment client,
  storage/CDN helper, queue factory, AI router. Do not introduce a parallel
  copy — wire new workers/routers through what's already there.
- **Stat counters:** keep cached counters on `creator_profiles` consistent
  with the same counter-update jobs PadVik already runs; don't double-count.
- **Cost logging:** every AI call (OCR, transcription, embeddings, RAG answer)
  logs to PadVik's AI-usage table (provider, model, tokens, cost, feature).
- **Tenancy/ownership:** saved content is owner-scoped exactly as PadVik
  already scopes user data.

---

## 5. Per-Feature Port Notes ("if missing, add; if present, extend")

1. **Creator foundation** — profile extra fields, content upload (text +
   document + image), browse. Most likely partially present → extend.
2. **Marketplace + earnings** — listing, purchase (reuse PadVik Razorpay),
   70/30 split, wallet, payout, ratings.
3. **Media pipeline** — video HLS transcode, audio AAC, **handwritten OCR**
   (PadVik already has the `buildOcrPrompt()` pattern — reuse it), document
   PDF/DOCX extraction. Mirror `CREATORS_COMPLETE_SPEC.md` §3.
4. **Classrooms** — extend PadVik's existing classrooms with pricing, join
   codes, assignments, submissions, per-classroom analytics.
5. **Doubts** — student↔creator + AI auto-answer.
6. **Live sessions** — schedule/join/attendance/recording; gate paid behind
   `is_free`.
7. **Promotions** — creator create-form + \*\*admin review/approve/reject/pause
   - metrics\*\* (the ExamForge "promotions admin flow" slice).
8. **Subscription-pool worker** — monthly distribution of free-tier viewing
   revenue; idempotent, capped at 25%/creator, fully tested.
9. **Creator AI tutor (RAG)** — embeddings on publish → top-k retrieval →
   grounded, cited answer; "I couldn't find this in the materials" guardrail.
10. **Creator analytics dashboard** — read-only KPIs + charts, creator-scoped.
11. **Public creator directory** — `/creators` + `/creators/[slug]`, SEO,
    needs a `slug` column on `creator_profiles` (additive).
12. **Multimedia follow-ups** — large-file video transcription (Gemini File
    API or ffmpeg audio-extract), auto-extract-on-publish (flagged).

---

## 6. Port Phases (recommended order — low blast radius → high)

- **P0 — Audit & gap report** (no code). Output the §1 matrix. Gates everything.
- **P1 — Additive profile/content/upload deltas** (no new user surface).
- **P2 — Read-only slices** (lowest risk): creator analytics, public directory.
- **P3 — Admin slices:** promotions admin flow.
- **P4 — Workers (no UI break):** subscription-pool distribution; media OCR/
  transcription extensions.
- **P5 — Interaction:** classroom extensions, doubts, live sessions.
- **P6 — Marketplace + earnings** (only if PadVik lacks it).
- **P7 — AI tutor RAG** (needs pgvector + new schema).

Each phase = one or more prompts in `PADVIK_CREATORS_PORT_PROMPTS.md`. Ship,
flag-OFF-merge, verify nothing existing broke, then the next phase.

---

## 7. Feature Flags (mirror ExamForge; add only the missing ones, OFF)

```
creators.enabled                      = false
creators.registration_open            = false
creators.marketplace_enabled          = false
creators.classrooms_enabled           = false   # if PadVik gates classrooms differently, reuse that
creators.live_sessions_enabled        = false
creators.video_upload_enabled         = false
creators.audio_upload_enabled         = false
creators.ocr_enabled                  = false
creators.promotions_enabled           = false
creators.doubts_enabled               = false
creators.ai_tutor_enabled             = false
creators.paid_classrooms_enabled      = false
creators.subscription_pool_enabled    = false
creators.directory_enabled            = false
creators.auto_extract_on_publish      = false
creators.revenue_share_verified       = 70
creators.revenue_share_premium        = 80
creators.subscription_pool_percent    = 20
creators.classroom_platform_fee_percent = 15
creators.min_payout_inr               = 500
creators.max_video_size_mb            = 2048
creators.max_audio_size_mb            = 500
creators.kyc_required_for_payout      = true
creators.auto_publish_threshold       = 0.75
```

---

## 8. Acceptance bar for the whole port

- Every existing PadVik creator feature still works **identically** with all
  new flags OFF (regression check is mandatory after each slice).
- Each new slice is reachable only behind its flag.
- No migration drops/renames/retypes any pre-existing column.
- All AI calls are cost-logged; all money flows reuse PadVik's payment client.
- The §1 gap matrix is kept current — update it as slices land.

```

```
