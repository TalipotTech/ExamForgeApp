# Portal Ingestion Pipeline — Implementation Status

> **Date:** 2026-03-13
> **Branch:** `feat/portal-ingestion-pipeline`
> **Status:** Examination Schedule + MCQ Question Papers working. Syllabus parsing working.

---

## 1. What's Built

### Working Features

| Feature                             | Status   | Notes                                                          |
| ----------------------------------- | -------- | -------------------------------------------------------------- |
| Portal page crawling (Kerala PSC)   | **Done** | Deterministic HTML parser for Drupal CMS pages                 |
| PDF discovery from portal pages     | **Done** | Extracts all PDF links with exam name mapping                  |
| MCQ question paper extraction       | **Done** | Vision + text-based extraction via Claude                      |
| Examination schedule extraction     | **Done** | Extracts exam table from notification PDFs                     |
| Staged questions review workflow    | **Done** | Admin reviews before approving to main question bank           |
| Exam mapping (manual + auto-create) | **Done** | Auto-creates draft exams from portal data                      |
| Syllabus PDF parsing                | **Done** | Claude Vision extracts tree structure from syllabus PDFs       |
| Syllabus URL auto-resolution        | **Done** | Scrapes listing page, fuzzy-matches exam name to find PDF      |
| Document type classification        | **Done** | Detects examination_schedule vs notification vs question_paper |
| Pagination support                  | **Done** | Crawls multi-page Kerala PSC listings (up to 10 pages)         |

### Pending Features (TODO)

| Feature                               | Priority | Notes                                                       |
| ------------------------------------- | -------- | ----------------------------------------------------------- |
| OMR Answer Key extraction             | High     | Schema + prompts ready, needs integration testing           |
| Online Answer Key extraction          | High     | Same as OMR, different PDF format                           |
| Descriptive question extraction       | Medium   | Schema + prompts ready                                      |
| Answer key matching to questions      | Medium   | Match by examId + questionNumber + paperYear                |
| Other portals (UPSC, NTA, TNPSC)      | Low      | portal-map.ts has configs, needs parser per portal          |
| PDF hyperlink extraction (pdfjs-dist) | Medium   | Extract embedded URLs from examination PDFs                 |
| Bulk syllabus parsing                 | Low      | Parse all syllabus links in an examination schedule at once |

---

## 2. Architecture Overview

```
Admin pastes URL (e.g., keralapsc.gov.in/previous-question-paper)
    |
    v
[tRPC: portalIngestion.ingestPortal]
    |
    v
[BullMQ: portal-ingestion queue]
    |
    v
[Portal Ingestion Worker]
    |-- Kerala PSC? --> Deterministic HTML parser (fast, free)
    |-- Unknown?    --> AI page structure extraction (Claude)
    |
    v
Creates portal_documents records (status: discovered)
    |
    v
[tRPC: portalIngestion.processDocuments]  (admin triggers)
    |
    v
[BullMQ: portal-processing queue]
    |
    v
[Portal Processing Worker]
    |-- Downloads PDF from original URL
    |-- Extracts text (pdf-parse)
    |-- If text quality poor --> Claude Vision fallback
    |
    v
[PDF Processor Service]  routes by document_type:
    |
    |-- question_paper_mcq     --> Extract MCQs --> staged_questions
    |-- examination_schedule   --> Extract exam table --> metadata JSONB
    |-- answer_key_omr/online  --> Extract answers --> match to questions
    |-- syllabus               --> Mark as processed
    |-- notification           --> Mark as processed
    |
    v
Admin reviews staged_questions --> Approve --> questions table
```

### Syllabus Parsing Flow

```
Examination Schedule PDF has entries with "Syllabus" links
    |
    v
Admin clicks "Parse" on an examination entry
    |
    v
[tRPC: portalIngestion.parseSyllabusFromUrl]
    |-- Resolves URL (relative -> absolute)
    |-- Tries direct URL first
    |-- If URL returns HTML --> extract PDF link from page
    |-- If URL is generic --> scrape syllabus listing page
    |       (keralapsc.gov.in/index.php/syllabus1)
    |       Fuzzy-match exam name against anchor text
    |-- Downloads PDF, saves to storage/syllabi/
    |-- Creates syllabi record
    |-- Queues BullMQ job
    |
    v
[Syllabus Processor Worker]
    |-- Re-downloads from sourceUrl (always fresh)
    |-- Detects HTML vs PDF content
    |-- If HTML: extract PDF link, download actual PDF
    |-- 404 detection (case-insensitive patterns)
    |-- Claude Vision: PDF -> structured tree JSON
    |-- Validates with recursive Zod schema (z.lazy)
    |-- Saves to syllabus_nodes table (adjacency list)
    |
    v
Admin views parsed syllabus tree in viewer dialog
```

---

## 3. Database Schema

### Tables (All Live)

#### `portal_documents`

Core tracking table for every PDF discovered from portal pages.

| Column                | Type    | Purpose                                                        |
| --------------------- | ------- | -------------------------------------------------------------- |
| `id`                  | UUID PK |                                                                |
| `portal_name`         | VARCHAR | "Kerala PSC"                                                   |
| `portal_url`          | VARCHAR | Source page URL                                                |
| `source_page_type`    | VARCHAR | examinations, previous_questions, omr_answer_key, etc.         |
| `document_type`       | VARCHAR | question_paper_mcq, examination_schedule, answer_key_omr, etc. |
| `title`               | VARCHAR | Extracted document title                                       |
| `exam_name`           | VARCHAR | Matched exam name                                              |
| `exam_year`           | INTEGER |                                                                |
| `original_url`        | VARCHAR | Direct PDF URL on portal                                       |
| `file_key`            | VARCHAR | Local storage path                                             |
| `processing_status`   | VARCHAR | discovered, processing, processed, error                       |
| `questions_extracted` | INTEGER | Count of questions found                                       |
| `answers_matched`     | INTEGER | Count of answer key matches                                    |
| `exam_id`             | UUID FK | Linked exam                                                    |
| `metadata`            | JSONB   | Flexible: examinations array, syllabusLinks, etc.              |
| `error_message`       | TEXT    | Last error                                                     |

**Schema file:** `packages/shared/src/db/schema/portal-documents.ts`

#### `staged_questions`

Intermediate review table before questions reach the main bank.

| Column               | Type    | Purpose                                        |
| -------------------- | ------- | ---------------------------------------------- |
| `id`                 | UUID PK |                                                |
| `portal_document_id` | UUID FK | Source PDF                                     |
| `exam_id`            | UUID FK | Target exam                                    |
| `content`            | JSONB   | Full question content (MCQ, descriptive, etc.) |
| `review_status`      | VARCHAR | pending, approved, rejected                    |
| `question_number`    | INTEGER | Original number in paper                       |

**Schema file:** `packages/shared/src/db/schema/staged-questions.ts`

#### `syllabi`

Tracks uploaded/discovered syllabus PDFs and their processing status.

| Column              | Type      | Purpose                                 |
| ------------------- | --------- | --------------------------------------- |
| `id`                | SERIAL PK |                                         |
| `exam_id`           | UUID FK   | Linked exam                             |
| `title`             | VARCHAR   | Syllabus name                           |
| `file_key`          | VARCHAR   | Local storage path                      |
| `status`            | VARCHAR   | uploading, processing, parsed, error    |
| `extraction_method` | VARCHAR   | claude-vision, text, manual             |
| `metadata`          | JSONB     | sourceUrl, nodeCount, token usage, cost |
| `error_message`     | TEXT      |                                         |

**Schema file:** `packages/shared/src/db/schema/syllabi.ts`

#### `syllabus_nodes`

Tree structure of parsed syllabus content (adjacency list pattern).

| Column        | Type              | Purpose                        |
| ------------- | ----------------- | ------------------------------ |
| `id`          | SERIAL PK         |                                |
| `syllabus_id` | INTEGER FK        | Parent syllabus                |
| `parent_id`   | INTEGER FK (self) | Parent node (null = root)      |
| `name`        | VARCHAR           | Node title                     |
| `node_type`   | VARCHAR           | unit, chapter, topic, subtopic |
| `depth`       | INTEGER           | Tree depth (0 = root)          |
| `sort_order`  | INTEGER           | Ordering within siblings       |
| `description` | TEXT              | Optional details               |

**Schema file:** `packages/shared/src/db/schema/syllabus-nodes.ts`

#### Extended: `questions`

Added columns for portal source tracking:

- `portal_document_id` (UUID FK)
- `paper_year` (INTEGER)
- `paper_number` (VARCHAR)
- `question_number` (INTEGER)

#### Extended: `exams`

Added columns for auto-discovery:

- `is_auto_discovered` (BOOLEAN)
- `discovery_source` (VARCHAR)

### Migrations

| Migration                             | Description                                   |
| ------------------------------------- | --------------------------------------------- |
| `0004_ambiguous_captain_universe.sql` | Add portal_documents, staged_questions tables |
| `0005_lean_pretty_boy.sql`            | Add scrape_sources, scrape_runs tables        |
| `0006_careful_romulus.sql`            | Add syllabi, syllabus_nodes tables            |
| `0007_abandoned_magma.sql`            | Add question source tracking columns          |

---

## 4. Code Flow — File by File

### Backend (apps/api/)

#### tRPC Router: `src/trpc/routers/portal-ingestion.ts`

**17 endpoints** — all admin-protected.

| Endpoint                | Type     | Purpose                                     |
| ----------------------- | -------- | ------------------------------------------- |
| `ingestPortal`          | mutation | Start crawling a portal page URL            |
| `processDocuments`      | mutation | Queue selected documents for PDF processing |
| `processAllByPageType`  | mutation | Batch process all discovered docs of a type |
| `getStagedQuestions`    | query    | Paginated staged questions with filters     |
| `approveQuestions`      | mutation | Move staged -> main questions table         |
| `rejectQuestions`       | mutation | Mark staged questions as rejected           |
| `mapDocumentExam`       | mutation | Link document to existing/new exam          |
| `getPortalDocuments`    | query    | List documents with filters + pagination    |
| `getPortalDocumentById` | query    | Single document with stats                  |
| `reprocessDocument`     | mutation | Re-queue a document for processing          |
| `getRunStatus`          | query    | Poll ingestion job progress                 |
| `getStats`              | query    | Aggregate counts dashboard                  |
| `clearData`             | mutation | Delete documents + staged questions         |
| `parseSyllabusFromUrl`  | mutation | Download + queue syllabus PDF parsing       |
| `getSyllabusData`       | query    | Fetch syllabus with all tree nodes          |
| `reparseSyllabus`       | mutation | Re-queue syllabus processing                |
| `getExamsByCategory`    | query    | Exam list for mapping dropdown              |

**Syllabus URL Resolution** (helper functions in same file):

- `buildCandidateUrls()` — Builds priority-ordered list of URLs to try
- `extractPdfLinkFromHtml()` — Smart PDF link extraction with scoring (anchor text + URL matching, penalty for nav junk)
- `findSyllabusFromListingPage()` — Scrapes `keralapsc.gov.in/index.php/syllabus1`, fuzzy-matches exam name to find direct PDF URL

#### Services

| File                                | Purpose                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/services/pdf-processor.ts`     | Core PDF processing engine. Routes by document type. Handles vision + text extraction.            |
| `src/services/portal-crawler.ts`    | Page crawling orchestrator. Deterministic parser for Kerala PSC, AI fallback for unknown portals. |
| `src/services/kerala-psc-parser.ts` | Specialized Drupal CMS HTML parser for Kerala PSC pages.                                          |

#### Workers (BullMQ)

| File                                      | Queue                | Concurrency | Purpose                                                 |
| ----------------------------------------- | -------------------- | ----------- | ------------------------------------------------------- |
| `src/workers/portal-ingestion-worker.ts`  | `portal-ingestion`   | 1           | Crawl portal page, create portal_documents records      |
| `src/workers/portal-processing-worker.ts` | `portal-processing`  | 2           | Download PDF, extract content, save to staged_questions |
| `src/workers/syllabus-processor.ts`       | `syllabus-processor` | 1           | Parse syllabus PDFs with Claude Vision, save tree nodes |
| `src/workers/index.ts`                    | —                    | —           | Worker registry, starts all workers                     |

#### Queues

| File                                    | Queue Name           |
| --------------------------------------- | -------------------- |
| `src/queues/portal-ingestion-queue.ts`  | `portal-ingestion`   |
| `src/queues/portal-processing-queue.ts` | `portal-processing`  |
| `src/queues/syllabus-queue.ts`          | `syllabus-processor` |

#### AI Prompts

| File                                    | Prompts                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `src/ai/prompts/portal-extraction.ts`   | MCQ extraction, answer key extraction, descriptive questions, page structure |
| `src/ai/prompts/syllabus-extraction.ts` | Syllabus tree extraction from PDF                                            |

#### Static File Serving

`src/index.ts` — Added `/api/files/*` route for serving locally stored PDFs with path traversal protection.

### Frontend (apps/web/)

#### Scraper Pages

| Page                | Path                                    | Purpose                                                |
| ------------------- | --------------------------------------- | ------------------------------------------------------ |
| Scraper Dashboard   | `/scraper/page.tsx`                     | Portal sources list, stats, quick actions              |
| Add Portal Source   | `/scraper/add/page.tsx`                 | Form to add new portal URL                             |
| Ingestion Dashboard | `/scraper/ingest/page.tsx`              | Tabs: discovered docs, processing queue, staged review |
| Document Detail     | `/scraper/ingest/[documentId]/page.tsx` | **Key page** — shows examination table OR questions    |

#### Document Detail Page — Key Components

The `[documentId]/page.tsx` is the most complex frontend page:

- **`ExaminationScheduleView`** — Renders examination entries as a searchable table with:
  - Color-coded badges for stage (preliminary/main/interview) and status (scheduled/postponed/cancelled)
  - Per-entry syllabus tracking (Parse / View / Reparse buttons)
  - Syllabus URL input dialog (auto-filled or manual entry)
  - Syllabus viewer dialog with tree rendering
  - Search/filter functionality

- **Questions Review View** — For MCQ/descriptive documents:
  - Staged questions list with approve/reject actions
  - Exam mapping dialog
  - Bulk approve/reject

### Shared Package (packages/shared/)

#### Schemas

| File                                | Tables             |
| ----------------------------------- | ------------------ |
| `src/db/schema/portal-documents.ts` | `portal_documents` |
| `src/db/schema/staged-questions.ts` | `staged_questions` |
| `src/db/schema/syllabi.ts`          | `syllabi`          |
| `src/db/schema/syllabus-nodes.ts`   | `syllabus_nodes`   |

#### Validators

| File                                 | Schemas                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `src/validators/portal-ingestion.ts` | `portalMCQSchema`, `answerKeySchema`, `descriptiveQuestionSchema`, `portalPageEntrySchema` |
| `src/validators/syllabus.ts`         | `syllabusTreeSchema` (recursive with `z.lazy()`)                                           |

---

## 5. Key Technical Decisions

### Claude Vision for PDF Extraction

- `generateObject` with structured output **cannot handle recursive Zod schemas** (`z.lazy()`)
- Solution: use `generateText` with JSON-only system prompt, strip markdown fences, `JSON.parse()`, then `schema.safeParse()`
- Vision is the primary extraction method; text-based is fallback when text quality is good

### Syllabus URL Resolution Strategy

Kerala PSC syllabus URLs are often broken (404 pages). Resolution strategy:

1. **Try direct URL** from PDF extraction
2. **Try HTML page** — if URL returns HTML, extract best PDF link from page content
3. **Scrape listing page** — fetch `keralapsc.gov.in/index.php/syllabus1`, fuzzy-match exam name against anchor text to find direct PDF
4. **Smart scoring** — anchor text matches (+8/word), URL matches (+4/word), penalty for nav junk (-100 for signatory/logo/etc.)

### Document Type Classification

- `pageType` (from portal page classification) takes priority over `linkType` (from AI)
- "EXAMINATION PROGRAMME" in title/label -> `examination_schedule` (not `notification`)
- Fallback chain: pageType -> linkType -> label pattern matching

### Staged Questions Workflow

All portal-extracted questions go to `staged_questions` first (never directly to `questions`). Admin must review and approve. This prevents bad AI extractions from polluting the question bank.

### Syllabus Tree Storage

- Adjacency list pattern with self-referencing `parent_id`
- Flat storage in DB, tree built in app code via `buildTree()` function
- Node types: unit, chapter, topic, subtopic
- Supports reparse: deletes existing nodes, re-inserts fresh

---

## 6. Configuration

### Portal Map (`apps/api/src/config/portal-map.ts`)

Pre-configured portal URLs for quick ingestion:

| Portal           | Page Types Supported                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Kerala PSC       | examinations, previous_questions, omr_answer_key, online_answer_key, descriptive_questions |
| NTA (NEET, GPAT) | Configured but not yet tested                                                              |
| UPSC             | Configured but not yet tested                                                              |
| UGC NET          | Configured but not yet tested                                                              |

### Environment Variables

| Variable                | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `ANTHROPIC_API_KEY`     | Claude API for vision/text extraction         |
| `DATABASE_URL`          | PostgreSQL connection                         |
| `REDIS_URL`             | BullMQ job queue                              |
| `SCRAPER_RATE_LIMIT_MS` | Delay between PDF downloads (default: 2000ms) |

---

## 7. Known Issues & Learnings

1. **Kerala PSC syllabus URLs are frequently broken** — Many exam-specific syllabus pages return 404. The listing page scrape (`/index.php/syllabus1`) is the most reliable fallback.

2. **PDF hyperlinks not extractable via Vision** — Claude Vision sees rendered text ("Syllabus") but not the underlying `href` URL. Need `pdfjs-dist` to extract link annotations from PDF binary.

3. **Examination Programme vs Notification** — Kerala PSC "EXAMINATION PROGRAMME" PDFs were incorrectly classified as notifications. Fixed by checking title pattern before falling back to AI link type.

4. **Recursive Zod schemas break `generateObject`** — `z.lazy()` causes "Recursive reference detected" errors with structured output mode. Workaround: use `generateText` + manual JSON parse + validate.

5. **Rate limiting** — Government portals may block rapid requests. 2-second delay between PDF downloads is enforced.

6. **Stale stored files** — If wrong PDF is saved to disk, reparse must re-download from source URL (stored in `syllabi.metadata.sourceUrl`), not read the potentially corrupt local file.

---

## 8. How to Test

### Ingest Examination Schedule

1. Go to `/scraper/ingest`
2. Select "Kerala PSC" portal, page type "Examinations"
3. Click "Ingest" — discovers ~13 examination programme PDFs
4. Click "Process" on any document
5. View the extracted examination table with exam entries
6. Click "Parse" on an entry to extract its syllabus

### Ingest Question Papers

1. Select page type "Previous Question Papers"
2. Click "Ingest" — discovers ~100 question paper PDFs
3. Process documents — extracts MCQs to staged_questions
4. Review and approve/reject individual questions
5. Map to an exam if not auto-matched

### Syllabus Parsing

1. From an examination schedule detail view, click "Parse" on an entry
2. Enter or confirm the syllabus PDF URL
3. Worker downloads PDF, extracts tree with Claude Vision
4. Click "View" to see the parsed syllabus tree
5. "Reparse" button re-processes with fresh download

---

## 9. Running the System

```bash
# Start all services
pnpm dev                    # Next.js + Fastify + Workers

# Or start individually
pnpm --filter @examforge/api dev        # API server (port 4000)
pnpm --filter @examforge/api worker:dev  # BullMQ workers
pnpm --filter @examforge/web dev         # Next.js frontend (port 3000)

# Database
pnpm db:generate   # Generate Drizzle migrations
pnpm db:migrate    # Run pending migrations
pnpm db:studio     # Open Drizzle Studio (DB browser)
```

---

## 10. Next Steps

### Immediate (High Priority)

- [ ] OMR Answer Key extraction + matching to existing questions
- [ ] Online Answer Key extraction
- [ ] PDF hyperlink extraction using `pdfjs-dist` (extract actual syllabus URLs from examination PDFs)
- [ ] Auto-refresh syllabus viewer dialog when processing completes (polling)

### Short Term

- [ ] Descriptive question paper extraction
- [ ] Bulk syllabus parsing (parse all entries in an examination schedule at once)
- [ ] Answer key -> question matching pipeline (process papers first, then answer keys)

### Medium Term

- [ ] UPSC portal parser
- [ ] NTA portal parser (NEET, GPAT)
- [ ] TNPSC portal parser
- [ ] Deduplication: semantic similarity check before saving questions
- [ ] Vector embeddings for extracted questions

### Long Term

- [ ] Browser-based scraping (Playwright) for JS-heavy portals
- [ ] Automatic periodic ingestion (scheduled jobs)
- [ ] User-facing question bank with year/paper filters
- [ ] Exam detail page showing ingested papers + answer keys
