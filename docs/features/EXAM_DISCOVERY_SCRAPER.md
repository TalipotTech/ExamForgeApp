# Feature: Exam Discovery & Intelligent Scraping Pipeline

> **Status:** Planning → Development
> **Branch:** `feat/exam-discovery-scraper`
> **Priority:** P1 — Core content acquisition engine

---

## 1. Overview

The Exam Discovery & Scraping Pipeline is the content acquisition backbone of
ExamForge. It has two complementary systems:

**A) Exam Discovery Agent** — LLM-powered agents that autonomously discover
new exams, upcoming exam dates, syllabus updates, and notification changes
from official Indian exam portals. Runs on a schedule and populates the
exams listing.

**B) Question Scraping Engine** — Configurable scrapers that extract
previous year questions, mock tests, and study material from user-added
sources (websites, PDFs, question banks). Admin adds sources with name +
URL; the system automatically scrapes and structures content.

```
┌─────────────────────┐     ┌─────────────────────┐
│  EXAM DISCOVERY     │     │  QUESTION SCRAPER    │
│  (LLM Agents)       │     │  (User-added Sources)│
│                     │     │                      │
│  • Find new exams   │     │  • Scrape URLs       │
│  • Track dates      │     │  • Extract questions  │
│  • Detect syllabus  │     │  • Parse PDFs        │
│    changes          │     │  • Deduplicate        │
│  • Monitor portals  │     │  • Validate & save    │
└────────┬────────────┘     └────────┬─────────────┘
         │                           │
         ▼                           ▼
┌──────────────────────────────────────────────────┐
│                   DATABASE                        │
│  exams (discovered) │ scrape_sources │ questions  │
│  exam_notifications │ scrape_runs    │ (scraped)  │
└──────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
┌──────────────────────────────────────────────────┐
│                   FRONTEND                        │
│  Home Page: exam cards │ /exams: full listing     │
│  /admin/scraper: source management                │
└──────────────────────────────────────────────────┘
```

---

## 2. User Flows

### 2.1 Admin: Add a Scrape Source

1. Navigate to Dashboard → Scraper → Add Source
2. Fill form:
   - **Name**: e.g., "PharmQuiz Daily MCQs"
   - **Website URL**: e.g., "https://pharmaquiz.net/bpharm-mcqs"
   - **Source Type**: Question Bank | Previous Year Papers | Mock Tests | Syllabus | Notes
   - **Target Exam**: Select exam (BPharm, NEET, etc.) or "Auto-detect"
   - **Scrape Frequency**: Manual | Daily | Weekly | Monthly
   - **Scrape Depth**: Single page | Follow links (max depth) | Sitemap
   - **Content Format**: HTML | PDF | Image (scanned)
   - **AI Provider for Extraction**: Claude | Gemini | OpenAI | Auto (cheapest)
   - **Notes**: Optional instructions for the scraper
3. Click "Test Scrape" → runs a single-page test, shows extracted preview
4. Click "Save & Activate" → source saved, first scrape scheduled

### 2.2 Admin: Monitor Scraping Activity

1. Dashboard → Scraper shows:
   - Active sources with status (active/paused/error)
   - Last scrape time, questions extracted, success rate
   - Live scrape log (real-time via WebSocket/polling)
   - Cost tracker: AI tokens used per source
2. Per-source detail: scrape history, extracted questions, error log
3. Global stats: total sources, total questions scraped, daily yield

### 2.3 Visitor/Student: Browse Exams

1. **Home page** shows:
   - Featured/upcoming exams in a card grid
   - "Trending" exams (most questions added recently)
   - Exam date countdown badges
   - Quick search bar
2. **`/exams` page** shows:
   - Full exam catalog with filters:
     - Category: Pharmacy | Medical | Civil Services | State PSC | Engineering
     - Status: Upcoming | Active | Past
     - Level: National | State | University
     - Search: by name, keyword, subject
   - Sort: by date, popularity, questions available
   - Each exam card shows: name, date, category, question count, syllabus status
   - Click → exam detail page (syllabus tree, question bank, mock tests)

### 2.4 Automatic Exam Discovery (Background)

1. Scheduled job runs daily/weekly
2. LLM agent searches official portals:
   - NTA (nta.ac.in) — NEET, GPAT, UGC NET
   - UPSC (upsc.gov.in) — Civil Services, IFS, CDS
   - State PSC portals (keralapsc.gov.in, tnpsc.gov.in, etc.)
   - PCI (pci.nic.in) — BPharm related notifications
   - University portals — assistant professor recruitments
3. Agent extracts: exam name, dates, eligibility, syllabus link, application link
4. New exams → saved to DB → appear on home/listing pages
5. Date changes → update existing records + create notification
6. Admin reviews auto-discovered exams before they go public (optional)

---

## 3. Database Schema

### 3.1 New Tables

```sql
-- Discovered exams with rich metadata (extends existing exams table pattern)
-- Note: We enhance the existing `exams` table with new columns rather than
-- creating a separate table. New columns below.

ALTER TABLE exams ADD COLUMN IF NOT EXISTS
  status VARCHAR(20) DEFAULT 'active',
    -- upcoming | active | past | draft
  exam_date TIMESTAMPTZ,
  registration_start TIMESTAMPTZ,
  registration_end TIMESTAMPTZ,
  result_date TIMESTAMPTZ,
  official_url VARCHAR(1000),
  application_url VARCHAR(1000),
  syllabus_url VARCHAR(1000),
  conducting_body VARCHAR(255),
    -- "NTA", "UPSC", "Kerala PSC", "PCI", "University of Mumbai"
  level VARCHAR(20) DEFAULT 'national',
    -- national | state | university | institutional
  eligibility TEXT,
  total_marks INTEGER,
  duration_minutes INTEGER,
  negative_marking BOOLEAN DEFAULT false,
  negative_marking_scheme VARCHAR(100),
    -- e.g., "-1/3 per wrong answer"
  exam_pattern JSONB DEFAULT '{}',
    -- { sections: [...], totalQuestions: 200, ... }
  tags JSONB DEFAULT '[]',
    -- ["pharmacy", "assistant professor", "2025", "kerala"]
  question_count INTEGER DEFAULT 0,       -- Cached count from questions table
  is_featured BOOLEAN DEFAULT false,
  is_auto_discovered BOOLEAN DEFAULT false,
  discovery_source VARCHAR(255),          -- URL where this exam was found
  last_checked_at TIMESTAMPTZ,
  popularity_score INTEGER DEFAULT 0;     -- Based on user activity

-- Exam notifications / updates
CREATE TABLE exam_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
    -- date_change | syllabus_update | registration_open | result_declared
    -- | new_exam | pattern_change | admit_card | correction_window
  title VARCHAR(500) NOT NULL,
  description TEXT,
  source_url VARCHAR(1000),
  is_read BOOLEAN DEFAULT false,
  is_important BOOLEAN DEFAULT false,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_exam_notifications_exam ON exam_notifications(exam_id);
CREATE INDEX idx_exam_notifications_type ON exam_notifications(type);

-- Scrape run history (per source, per execution)
CREATE TABLE scrape_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES scrape_sources(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
    -- queued | running | completed | partial | failed
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  pages_visited INTEGER DEFAULT 0,
  pages_failed INTEGER DEFAULT 0,
  questions_found INTEGER DEFAULT 0,
  questions_new INTEGER DEFAULT 0,          -- After dedup
  questions_duplicate INTEGER DEFAULT 0,
  ai_provider VARCHAR(50),
  ai_tokens_used INTEGER DEFAULT 0,
  ai_cost_usd REAL DEFAULT 0,
  error_log JSONB DEFAULT '[]',
    -- [{ page: "url", error: "message", timestamp: "..." }]
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scrape_runs_source ON scrape_runs(source_id);
CREATE INDEX idx_scrape_runs_status ON scrape_runs(status);

-- Discovery agent run logs
CREATE TABLE discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type VARCHAR(30) NOT NULL,
    -- exam_finder | date_tracker | syllabus_monitor
  portals_checked JSONB NOT NULL,         -- ["nta.ac.in", "upsc.gov.in"]
  exams_found INTEGER DEFAULT 0,
  exams_new INTEGER DEFAULT 0,
  exams_updated INTEGER DEFAULT 0,
  notifications_created INTEGER DEFAULT 0,
  ai_provider VARCHAR(50),
  ai_tokens_used INTEGER DEFAULT 0,
  ai_cost_usd REAL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  error_log JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 Enhance Existing `scrape_sources` Table

Add columns to the existing table:

```sql
ALTER TABLE scrape_sources ADD COLUMN IF NOT EXISTS
  source_type VARCHAR(30) DEFAULT 'question_bank',
    -- question_bank | previous_year | mock_test | syllabus | notes | portal
  scrape_frequency VARCHAR(20) DEFAULT 'manual',
    -- manual | daily | weekly | monthly
  scrape_depth INTEGER DEFAULT 1,           -- Max pages to follow
  content_format VARCHAR(20) DEFAULT 'html',
    -- html | pdf | image
  ai_provider VARCHAR(50) DEFAULT 'auto',   -- Which AI to use for extraction
  total_runs INTEGER DEFAULT 0,
  successful_runs INTEGER DEFAULT 0,
  total_questions_scraped INTEGER DEFAULT 0,
  last_error TEXT,
  next_run_at TIMESTAMPTZ,
  notes TEXT,
  tags JSONB DEFAULT '[]';
```

---

## 4. Scraping Architecture

### 4.1 Question Scraping Worker

```
BullMQ Job: scrape-questions
  │
  ├── 1. Fetch page(s)
  │   ├── Cheerio (static HTML) — fast, cheap
  │   ├── Playwright (JS-rendered) — for SPAs, infinite scroll
  │   └── Firecrawl (AI-assisted) — complex layouts
  │
  ├── 2. Extract content
  │   ├── PDF: pdf-parse → raw text
  │   ├── HTML: Cheerio → structured content
  │   └── Image: Claude Vision / Gemini → OCR text
  │
  ├── 3. AI question extraction
  │   ├── Send content to selected AI provider
  │   ├── Prompt: "Extract exam questions from this content"
  │   ├── Validate: Instructor.js + QuestionSchema
  │   └── Return: QuestionSchema[]
  │
  ├── 4. Deduplication
  │   ├── Exact match: question text hash
  │   ├── Semantic: embedding cosine similarity > 0.92
  │   └── Skip duplicates, count them
  │
  ├── 5. Save to DB
  │   ├── New questions → questions table
  │   ├── Source attribution → source field
  │   └── Update scrape_sources counters
  │
  └── 6. Report
      ├── Update scrape_runs with results
      └── Emit progress events (WebSocket/polling)
```

### 4.2 Exam Discovery Agent

```
BullMQ Job: discover-exams (scheduled: daily)
  │
  ├── 1. For each monitored portal:
  │   ├── Fetch latest notifications page
  │   ├── Firecrawl / Playwright → clean markdown
  │   └── Send to LLM: "Extract exam announcements"
  │
  ├── 2. LLM extracts structured data:
  │   ├── Exam name, conducting body
  │   ├── Important dates (exam, registration, result)
  │   ├── Eligibility criteria
  │   ├── Syllabus link, application link
  │   └── Any changes from previous check
  │
  ├── 3. Match against existing exams:
  │   ├── Name similarity + conducting body match
  │   ├── If new → create exam (is_auto_discovered=true)
  │   ├── If exists + dates changed → update + create notification
  │   └── If exists + no change → skip, update last_checked_at
  │
  └── 4. Create notifications for:
      ├── New exams discovered
      ├── Date changes
      ├── Registration windows opening
      └── Syllabus updates detected
```

### 4.3 Official Portals to Monitor

| Portal           | URL                 | Exams                         | Check Frequency |
| ---------------- | ------------------- | ----------------------------- | --------------- |
| NTA              | nta.ac.in           | NEET, GPAT, UGC NET, CSIR NET | Daily           |
| UPSC             | upsc.gov.in         | CSE, IFS, CDS, NDA, CAPF      | Daily           |
| Kerala PSC       | keralapsc.gov.in    | All Kerala state exams        | Daily           |
| TNPSC            | tnpsc.gov.in        | Tamil Nadu state exams        | Weekly          |
| APPSC            | psc.ap.gov.in       | Andhra Pradesh exams          | Weekly          |
| KPSC             | kpsc.kar.nic.in     | Karnataka exams               | Weekly          |
| PCI              | pci.nic.in          | BPharm, MPharm regulations    | Weekly          |
| MCI/NMC          | nmc.org.in          | FMGE, NEET PG updates         | Weekly          |
| GATE             | gate2026.iitb.ac.in | GATE (changes yearly)         | Monthly         |
| University sites | Various             | Asst Professor recruitments   | Weekly          |

---

## 5. API Endpoints (tRPC)

### scrapeSource router

```typescript
scrapeSourceRouter = router({
  // CRUD
  create: adminProcedure.input(CreateScrapeSourceSchema).mutation(),

  update: adminProcedure.input(UpdateScrapeSourceSchema).mutation(),

  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(),

  list: adminProcedure
    .input(
      z.object({
        examId: z.string().uuid().optional(),
        status: z.enum(["active", "paused", "error", "pending"]).optional(),
        sourceType: z.string().optional(),
      }),
    )
    .query(),

  getById: adminProcedure.input(z.object({ id: z.string().uuid() })).query(),

  // Scraping operations
  testScrape: adminProcedure // Single-page test run
    .input(z.object({ id: z.string().uuid() }))
    .mutation(),

  startScrape: adminProcedure // Full scrape run
    .input(z.object({ id: z.string().uuid() }))
    .mutation(),

  pauseSource: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(),

  // Run history
  getRuns: adminProcedure
    .input(z.object({ sourceId: z.string().uuid(), limit: z.number().default(10) }))
    .query(),

  getRunLog: adminProcedure.input(z.object({ runId: z.string().uuid() })).query(),
});
```

### exam router (public + admin)

```typescript
examRouter = router({
  // Public
  listPublic: publicProcedure
    .input(
      z.object({
        category: z.string().optional(),
        status: z.enum(["upcoming", "active", "past"]).optional(),
        level: z.enum(["national", "state", "university"]).optional(),
        search: z.string().optional(),
        sort: z.enum(["date", "popularity", "questions", "name"]).default("date"),
        page: z.number().default(1),
        limit: z.number().default(20),
      }),
    )
    .query(),

  getFeatured: publicProcedure // For home page
    .query(),

  getUpcoming: publicProcedure // Exams with dates in future
    .input(z.object({ limit: z.number().default(6) }))
    .query(),

  getById: publicProcedure.input(z.object({ id: z.string().uuid() })).query(),

  getNotifications: protectedProcedure
    .input(z.object({ examId: z.string().uuid().optional() }))
    .query(),

  // Admin
  update: adminProcedure.input(UpdateExamSchema).mutation(),

  toggleFeatured: adminProcedure
    .input(z.object({ id: z.string().uuid(), featured: z.boolean() }))
    .mutation(),

  // Discovery
  runDiscovery: adminProcedure // Trigger manual discovery run
    .mutation(),

  getDiscoveryRuns: adminProcedure.input(z.object({ limit: z.number().default(10) })).query(),
});
```

---

## 6. File Locations

| What                       | Where                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| Drizzle schema additions   | `packages/shared/src/db/schema/exam-notifications.ts`, `scrape-runs.ts`, `discovery-runs.ts` |
| Drizzle schema alterations | `packages/shared/src/db/schema/exams.ts` (add columns), `scrape-sources.ts` (add columns)    |
| Zod validators             | `packages/shared/src/validators/scrape-source.ts`, `exam-listing.ts`                         |
| tRPC routers               | `apps/api/src/routers/scrape-source.ts`, `apps/api/src/routers/exam.ts`                      |
| BullMQ workers             | `apps/api/src/workers/scraper-worker.ts`, `apps/api/src/workers/discovery-agent.ts`          |
| AI prompts                 | `apps/api/src/ai/prompts/question-extraction.ts`, `exam-discovery.ts`                        |
| Admin: Source management   | `apps/web/src/app/(dashboard)/scraper/page.tsx`                                              |
| Admin: Add source form     | `apps/web/src/app/(dashboard)/scraper/add/page.tsx`                                          |
| Admin: Source detail       | `apps/web/src/app/(dashboard)/scraper/[id]/page.tsx`                                         |
| Public: Exam listing       | `apps/web/src/app/exams/page.tsx`                                                            |
| Public: Exam detail        | `apps/web/src/app/exams/[id]/page.tsx`                                                       |
| Home page: Exam section    | `apps/web/src/components/home/exam-showcase.tsx`                                             |

---

## 7. Implementation Order

1. **Database** — Alter exams + scrape_sources, create new tables, migration (Claude Code)
2. **Scraper Worker** — BullMQ worker with Crawlee + AI extraction (Claude Code)
3. **Discovery Agent** — LLM-powered portal monitoring (Claude Code)
4. **tRPC Routers** — scrapeSource + exam endpoints (Claude Code)
5. **Admin: Source Manager UI** — Add/edit/monitor sources (Cursor)
6. **Public: Exam Listing Page** — Full catalog with filters (Cursor)
7. **Home Page: Exam Showcase** — Featured + upcoming cards (Cursor)
8. **Scheduled Jobs** — BullMQ repeatable jobs for auto-scrape + discovery (Claude Code)
9. **Integration Testing** — Full pipeline E2E (Claude Code)
