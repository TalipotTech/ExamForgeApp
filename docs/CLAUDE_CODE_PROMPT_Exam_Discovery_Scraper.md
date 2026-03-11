# Claude Code Implementation Prompt — Exam Discovery & Scraping Pipeline

> **Copy this entire file and paste into Claude Code as a single prompt.**
> **The Add Source page already exists. This covers everything else.**
> **Read CLAUDE.md, BACKLOG.md, and docs/features/EXAM_DISCOVERY_SCRAPER.md first.**

---

## Context

ExamForge is a monorepo (Turborepo + pnpm) with:

- `apps/web` — Next.js 15 (App Router), Tailwind v4, shadcn/ui
- `apps/api` — Fastify 5, tRPC v11, BullMQ
- `packages/shared` — Drizzle ORM schema, Zod validators, types

Current state:

- 8 tables live (organizations, users, exams, questions, question_versions, exam_sessions, scrape_sources, ai_usage_logs)
- 2 migrations applied, seed script working
- Auth: NextAuth v5 with credentials, middleware-protected dashboard
- Add Source page already built at `apps/web/src/app/(dashboard)/scraper/add/page.tsx`
- Dev login: admin@examforge.dev / password123

Read these docs before starting:

- @CLAUDE.md for all conventions
- @docs/features/EXAM_DISCOVERY_SCRAPER.md for full spec
- @docs/prompts/SCRAPER_PROMPTS.md for AI prompts
- @.claude/rules/scraper-discovery.md for scraper-specific rules
- @BACKLOG.md for task checklist

---

## IMPORTANT: Implementation Rules

1. **Do NOT touch the Add Source page** — it already exists and works.
2. **Alter existing tables** (exams, scrape_sources) — do NOT create replacement tables.
3. **One migration file** for all schema changes (migration 0003).
4. **Follow existing patterns** — look at how existing schemas, routers, and pages are built before writing new ones. Match the style exactly.
5. **Use existing dotenv workaround** — all sub-packages load `../../.env.local` via dotenv (see CLAUDE.md Known Fixes).
6. **Export everything from `packages/shared/src/index.ts`** — schemas, validators, types.
7. **Test each step** — run `pnpm db:generate`, `pnpm db:migrate`, `pnpm build` after schema changes before moving on.

---

## Step 1: Database Schema Changes

### 1A. Alter `exams` table — add new columns

Edit `packages/shared/src/db/schema/exams.ts`. Add these columns to the existing table definition:

```
status: varchar("status", { length: 20 }).default("active")
  — values: upcoming | active | past | draft
examDate: timestamp("exam_date")
registrationStart: timestamp("registration_start")
registrationEnd: timestamp("registration_end")
resultDate: timestamp("result_date")
officialUrl: varchar("official_url", { length: 1000 })
applicationUrl: varchar("application_url", { length: 1000 })
syllabusUrl: varchar("syllabus_url", { length: 1000 })
conductingBody: varchar("conducting_body", { length: 255 })
level: varchar("level", { length: 20 }).default("national")
  — values: national | state | university | institutional
eligibility: text("eligibility")
totalMarks: integer("total_marks")
durationMinutes: integer("duration_minutes")
negativeMarking: boolean("negative_marking").default(false)
negativeMarkingScheme: varchar("negative_marking_scheme", { length: 100 })
examPattern: jsonb("exam_pattern").default({})
tags: jsonb("tags").default([])
questionCount: integer("question_count").default(0)
isFeatured: boolean("is_featured").default(false)
isAutoDiscovered: boolean("is_auto_discovered").default(false)
discoverySource: varchar("discovery_source", { length: 255 })
lastCheckedAt: timestamp("last_checked_at")
popularityScore: integer("popularity_score").default(0)
```

Add indexes: `status`, `examDate`, `conductingBody`, `isFeatured`.

### 1B. Alter `scrape_sources` table — add new columns

Edit `packages/shared/src/db/schema/scrape-sources.ts`. Add:

```
sourceType: varchar("source_type", { length: 30 }).default("question_bank")
  — values: question_bank | previous_year | mock_test | syllabus | notes | portal
scrapeFrequency: varchar("scrape_frequency", { length: 20 }).default("manual")
  — values: manual | daily | weekly | monthly
scrapeDepth: integer("scrape_depth").default(1)
contentFormat: varchar("content_format", { length: 20 }).default("html")
  — values: html | pdf | image | mixed
aiProvider: varchar("ai_provider", { length: 50 }).default("auto")
totalRuns: integer("total_runs").default(0)
successfulRuns: integer("successful_runs").default(0)
totalQuestionsScraped: integer("total_questions_scraped").default(0)
lastError: text("last_error")
nextRunAt: timestamp("next_run_at")
notes: text("notes")
tags: jsonb("tags").default([])
```

### 1C. Create `exam_notifications` table

Create `packages/shared/src/db/schema/exam-notifications.ts`:

```
Table: exam_notifications
Columns:
- id: UUID PK
- examId: UUID FK → exams(id) ON DELETE CASCADE
- type: varchar(30) NOT NULL
  — values: date_change | syllabus_update | registration_open | result_declared | new_exam | pattern_change | admit_card | correction_window
- title: varchar(500) NOT NULL
- description: text
- sourceUrl: varchar(1000)
- isRead: boolean default false
- isImportant: boolean default false
- detectedAt: timestamp NOT NULL default now()
- createdAt: timestamp NOT NULL default now()

Indexes: examId, type
```

### 1D. Create `scrape_runs` table

Create `packages/shared/src/db/schema/scrape-runs.ts`:

```
Table: scrape_runs
Columns:
- id: UUID PK
- sourceId: UUID FK → scrape_sources(id) ON DELETE CASCADE
- status: varchar(20) NOT NULL default 'running'
  — values: queued | running | completed | partial | failed
- startedAt: timestamp NOT NULL default now()
- completedAt: timestamp
- pagesVisited: integer default 0
- pagesFailed: integer default 0
- questionsFound: integer default 0
- questionsNew: integer default 0
- questionsDuplicate: integer default 0
- aiProvider: varchar(50)
- aiTokensUsed: integer default 0
- aiCostUsd: real default 0
- errorLog: jsonb default []
- metadata: jsonb default {}
- createdAt: timestamp NOT NULL default now()

Indexes: sourceId, status
```

### 1E. Create `discovery_runs` table

Create `packages/shared/src/db/schema/discovery-runs.ts`:

```
Table: discovery_runs
Columns:
- id: UUID PK
- agentType: varchar(30) NOT NULL
  — values: exam_finder | date_tracker | syllabus_monitor
- portalsChecked: jsonb NOT NULL
- examsFound: integer default 0
- examsNew: integer default 0
- examsUpdated: integer default 0
- notificationsCreated: integer default 0
- aiProvider: varchar(50)
- aiTokensUsed: integer default 0
- aiCostUsd: real default 0
- status: varchar(20) NOT NULL default 'running'
- errorLog: jsonb default []
- startedAt: timestamp NOT NULL default now()
- completedAt: timestamp
- createdAt: timestamp NOT NULL default now()
```

### 1F. Export & Generate Migration

1. Export all new schemas from `packages/shared/src/db/schema/index.ts`
2. Export from `packages/shared/src/index.ts`
3. Run: `pnpm db:generate`
4. Run: `pnpm db:migrate`
5. Verify migration applied with no errors.

### 1G. Create Zod Validators

Create `packages/shared/src/validators/scrape-source.ts`:

- `CreateScrapeSourceSchema` — for the add source form
- `UpdateScrapeSourceSchema` — partial version
- `ScrapeSourceFilterSchema` — for listing queries

Create `packages/shared/src/validators/exam-listing.ts`:

- `ExamListingFilterSchema` — category, status, level, search, sort, page, limit
- `UpdateExamSchema` — for admin edits
- `DiscoveredExamSchema` — for AI extraction output validation
- `ExamNotificationSchema` — for notification creation

Export from `packages/shared/src/validators/index.ts` and `packages/shared/src/index.ts`.

### 1H. Update Seed Script

Update `packages/shared/scripts/seed.ts` to:

- Add the new columns to the existing 3 exam records (BPharm, GPAT, NEET)
- Add 7 more exams covering: UPSC CSE, Kerala PSC Pharmacist, TNPSC Asst Prof, NEET PG, FMGE, GATE Pharmacy, UGC NET Pharmaceutical Sciences
- Each exam should have realistic: dates (some upcoming, 1 past), conducting body, eligibility, exam pattern, tags
- Add 3 sample scrape sources with the new columns populated
- Add 2 sample exam_notifications
- Run: `pnpm db:seed` and verify.

---

## Step 2: tRPC Routers

### 2A. Create `apps/api/src/routers/exam.ts`

Public endpoints (no auth required — use publicProcedure):

**listPublic** — query

- Input: ExamListingFilterSchema (category?, status?, level?, search?, sort?, page, limit)
- Logic:
  - Build Drizzle query with dynamic WHERE clauses based on filters
  - Search: use ILIKE on name, conducting_body, eligibility. Also search tags JSONB.
  - Sort: by exam_date (default), popularity_score, question_count, name
  - Pagination: offset-based (page \* limit)
  - Return: { exams: [], total: number, page, totalPages }

**getFeatured** — query

- No input
- Return: exams where is_featured=true, ordered by exam_date, limit 6

**getUpcoming** — query

- Input: { limit: z.number().default(6) }
- Return: exams where exam_date > now() AND status='upcoming', ordered by nearest date

**getById** — query

- Input: { id: z.string().uuid() }
- Return: full exam record + notification count + question count (from questions table)

**getNotifications** — protectedProcedure

- Input: { examId: z.string().uuid().optional() }
- Return: notifications for exam, ordered by detected_at desc

Admin endpoints (require admin role — use adminProcedure or role check):

**update** — mutation

- Input: UpdateExamSchema
- Updates exam record

**toggleFeatured** — mutation

- Input: { id, featured: boolean }
- Sets is_featured flag

### 2B. Create `apps/api/src/routers/scrape-source.ts`

All endpoints require admin role.

**create** — mutation

- Input: CreateScrapeSourceSchema
- Creates scrape_source record
- Returns created record

**update** — mutation

- Input: UpdateScrapeSourceSchema (partial, id required)
- Updates scrape_source record

**delete** — mutation

- Input: { id }
- Deletes source + cascade deletes scrape_runs

**list** — query

- Input: { examId?, status?, sourceType?, search? }
- Returns: sources with computed fields (last run, success rate)

**getById** — query

- Input: { id }
- Returns: source + last 5 scrape_runs

**testScrape** — mutation

- Input: { id }
- Creates a scrape_run with status=running
- **For now: return mock data** (we'll implement the actual worker later)
- Return: { questionsFound: number, preview: QuestionSchema[] }

**startScrape** — mutation

- Input: { id }
- Creates scrape_run, **queues BullMQ job** (job name: "scrape-questions")
- Returns: { runId }

**pauseSource** — mutation

- Input: { id }
- Toggle status between active/paused

**getRuns** — query

- Input: { sourceId, limit: 10 }
- Returns: scrape_runs ordered by startedAt desc

**getStats** — query

- No input
- Returns: { totalSources, activeSources, totalQuestionsScraped, todayYield }

### 2C. Register Routers

Register both routers in the main app router at `apps/api/src/routers/index.ts` (or wherever the root router is).

### 2D. Test

Run `pnpm dev` and test the endpoints via the tRPC panel or curl:

- GET /api/trpc/exam.listPublic?input={}
- GET /api/trpc/exam.getFeatured
- GET /api/trpc/exam.getUpcoming

---

## Step 3: Frontend — Scraper Manager Page

Create `apps/web/src/app/(dashboard)/scraper/page.tsx`

This is the admin scraper dashboard. The Add Source page already exists at `/scraper/add`.

### Layout:

1. **Header**: "Scraper Manager" title + "Run Discovery Agent" button + "Add Source" button (links to /scraper/add)

2. **Stats bar** (4 cards in a row):
   - Total Sources (from scrapeSource.getStats)
   - Active Sources
   - Total Questions Scraped
   - Today's Yield

3. **Filter tabs**: All | Active | Paused | Error | Pending — with counts

4. **Sources table** (shadcn Table component):
   Columns: Source (name + URL), Exam, Type (Badge), Status (dot + label), Last Scraped, Questions, Success Rate, Actions
   Actions column: "Scrape Now" button + "Pause/Resume" button + "..." dropdown (Edit, View History, Delete)
   - "Scrape Now" calls scrapeSource.startScrape, then polls getRuns for status
   - Row click → navigates to /scraper/[id] (detail page)

5. **Live Scrape Log** (bottom card):
   - Poll scrapeSource.getRuns every 3 seconds when any source is running
   - Show recent log entries in monospace font
   - Green=success, Red=error, Gray=info

### Data fetching:

- Use tRPC + TanStack Query
- `scrapeSource.list` for the table
- `scrapeSource.getStats` for the stats bar
- Refetch interval: 5s when any source has status 'active' (live updates)

### Components to use:

shadcn/ui: Card, Table, TableHeader, TableBody, TableRow, TableCell, Badge, Button, DropdownMenu, Skeleton

### Link the Add Source page:

The "Add Source" button should link to `/scraper/add` (already exists).

---

## Step 4: Frontend — Public Exam Listing Page

Create `apps/web/src/app/exams/page.tsx`

This is a PUBLIC page (no auth required). Must be SEO-friendly.

### Layout:

1. **Header**: "Exam Catalog" + subtitle with total count + upcoming count

2. **Two-column layout**: Filter sidebar (left, 220px) + Exam cards grid (right)

3. **Filter sidebar** (sticky):
   - Search input (debounced 300ms, searches name + tags + conducting_body)
   - Category: checkboxes for Pharmacy, Medical, Civil Services, State PSC, Engineering
   - Status: radio group — All, Upcoming, Active, Past
   - Sort: select — Exam Date, Popularity, Questions Available, Name

4. **Exam cards** (2-column grid):
   Each card shows:
   - Category badge (color-coded) + Status badge + Level badge
   - Exam name (bold, larger)
   - Conducting body (subtitle)
   - Two small info boxes: Exam Date + Countdown ("X days left" or "Completed")
   - Bottom row: Question count + negative marking indicator + "Start Practice" button

5. **Pagination**: "Load More" button at bottom (offset-based)

6. **Empty state**: icon + "No exams match your filters"

### Data fetching:

- Server Component for initial load with searchParams
- TanStack Query on client for filter changes
- Sync filters with URL search params: `/exams?category=pharmacy&status=upcoming&sort=date`

### SEO:

```typescript
export async function generateMetadata({ searchParams }) {
  const category = searchParams.category;
  const status = searchParams.status;
  return {
    title: `${category ? category + " " : ""}Exams${status ? " — " + status : ""} | ExamForge`,
    description: `Browse ${category || "all"} competitive exam preparation for India...`,
  };
}
```

### Mobile:

- Filter sidebar collapses to a "Filters" button that opens a Sheet (shadcn)
- Cards switch to single column
- Search stays visible at top

---

## Step 5: Frontend — Home Page Exam Showcase

The landing page already exists at `apps/web/src/app/page.tsx`.

**Add a new section** between the existing features grid and the CTA section.

### Create `apps/web/src/components/home/exam-showcase.tsx`:

1. **Section header**: "Prepare for India's Top Exams" + subtitle

2. **Featured exams** (3 cards, horizontal):
   - Fetch from `exam.getFeatured` (limit 3)
   - Each card: exam name, body, date, question count, category icon
   - Click → `/exams/[id]`

3. **Upcoming exams** (3 cards, horizontal):
   - Fetch from `exam.getUpcoming` (limit 3)
   - Each card: exam name, countdown badge, registration deadline
   - Highlight if registration closing soon (< 7 days)

4. **"View All Exams →"** link at bottom → `/exams`

5. **Responsive**: 3 columns → 2 → 1

Import and render this component in the landing page.

---

## Step 6: Frontend — Exam Detail Page

Create `apps/web/src/app/exams/[id]/page.tsx`

Public page. Fetches exam by ID via `exam.getById`.

### Layout:

1. **Header**: Exam name + conducting body + category/level/status badges
2. **Key dates** card: exam date (with countdown), registration dates, result date
3. **Details** card: eligibility, exam pattern (marks, duration, negative marking), official links
4. **Notifications** feed: recent exam_notifications for this exam (date changes, etc.)
5. **Question Bank** section: subject-wise question count from the questions table
6. **CTA buttons**: "Start Practice", "View Syllabus" (if syllabus linked), "Apply Now" (external link)

### SEO:

```typescript
export async function generateMetadata({ params }) {
  // Fetch exam name for title
  return {
    title: `${exam.name} — Preparation | ExamForge`,
    description: `Prepare for ${exam.name} conducted by ${exam.conductingBody}. ${exam.questions} practice questions available.`,
  };
}
```

---

## Step 7: Wire Everything Together

1. **Update the dashboard sidebar navigation** to include:
   - "Scraper" link → `/scraper` (admin only)
   - The scraper page should show in the nav for admin users only

2. **Update the landing page navigation** to include:
   - "Exams" link → `/exams` (public, visible to all)

3. **Connect the Add Source form** to the new tRPC endpoints:
   - The existing add source page should call `scrapeSource.create` on save
   - The "Test Scrape" button should call `scrapeSource.testScrape`
   - On successful save, redirect to `/scraper`

4. **Run full build check**:

   ```
   pnpm lint
   pnpm build
   pnpm db:seed
   pnpm dev
   ```

5. **Verify these flows work**:
   - Visit `/exams` — see 10 seeded exams with working filters
   - Visit `/exams/[id]` — see exam detail page
   - Login as admin → visit `/scraper` — see sources list
   - Visit `/scraper/add` — form works, connects to tRPC
   - Home page → scroll to exam showcase section

---

## Step 8: Update Tracking Files

After completing all steps:

1. Update `BACKLOG.md` — check off completed items in Phase 1.6
2. Update `TASKS_COMPLETED.md` — add Task 5 entry with:
   - Tables altered/created
   - Endpoints created
   - Pages created
   - Problems fixed (if any)
3. Commit with: `feat: implement exam discovery & scraping pipeline`

---

## Implementation Order Summary

```
Step 1 → Database (schema changes + migration + validators + seed)
Step 2 → tRPC routers (exam + scrapeSource)
Step 3 → Scraper Manager page (admin)
Step 4 → Exam Listing page (public)
Step 5 → Home page exam showcase section
Step 6 → Exam Detail page
Step 7 → Wire together + verify
Step 8 → Update tracking docs
```

Start with Step 1. After each step, run `pnpm build` to verify no type errors before moving on. If a step produces errors, fix them before proceeding.
