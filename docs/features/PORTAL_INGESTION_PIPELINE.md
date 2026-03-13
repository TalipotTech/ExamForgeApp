# Feature: Portal Ingestion Pipeline — Full URL-to-Content Extraction

> **Integrates into:** Exam Discovery & Scraper module (`apps/api/src/workers/`)
> **Triggered from:** Admin dashboard → Content Finder OR Scraper → "Ingest Portal"
> **Branch:** `feat/portal-ingestion`

---

## 1. The Problem

Admin pastes a URL like:

```
https://keralapsc.gov.in/examinations
https://keralapsc.gov.in/previous-question-paper
https://keralapsc.gov.in/omr-answer-key
https://keralapsc.gov.in/online-answer-key
https://keralapsc.gov.in/question-paper-descriptive-examination
```

The system must automatically:

1. Crawl the page and discover all exam entries + linked PDFs
2. Download every PDF
3. Extract content from each PDF (questions, answer keys, syllabus)
4. Save structured data to the database
5. Make it browsable by users through the app

---

## 2. How It Works

```
Admin pastes URL
    │
    ▼
┌──────────────────────────────────────────┐
│  STEP 1: PAGE CRAWL                      │
│  Playwright fetches the page             │
│  (Kerala PSC uses JS rendering)          │
│  Extracts: exam names, dates, PDF links  │
│  from tables, lists, download buttons    │
└─────────────────┬────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────┐
│  STEP 2: PDF DISCOVERY                   │
│  For each exam entry on the page:        │
│  - Find linked PDFs (question paper,     │
│    answer key, syllabus, notification)   │
│  - Classify each PDF by type             │
│  - Queue for download                    │
└─────────────────┬────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────┐
│  STEP 3: PDF DOWNLOAD + STORAGE          │
│  Download each PDF to S3                 │
│  Store: portal-pdfs/{portal}/{exam}/     │
│  Record in portal_documents table        │
└─────────────────┬────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────┐
│  STEP 4: DOCUMENT INTELLIGENCE           │
│  For each PDF, based on type:            │
│                                          │
│  Question Paper (MCQ):                   │
│    → pdf-parse extract text              │
│    → AI extracts QuestionSchema[]        │
│    → Save to questions table             │
│                                          │
│  Question Paper (Descriptive):           │
│    → pdf-parse + Claude Vision (tables)  │
│    → AI extracts question text + marks   │
│    → Save as descriptive questions       │
│                                          │
│  Answer Key (OMR):                       │
│    → pdf-parse or Claude Vision          │
│    → AI extracts: Q# → Answer mapping   │
│    → Match to existing questions         │
│    → Update questions.answer field       │
│                                          │
│  Answer Key (Online):                    │
│    → Same as OMR but different format    │
│                                          │
│  Syllabus / Notification:               │
│    → pdf-parse extract text              │
│    → AI extracts syllabus tree           │
│    → Save to syllabi + syllabus_nodes    │
└─────────────────┬────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────┐
│  STEP 5: USER-FACING CONTENT            │
│  Questions appear in question bank       │
│  Syllabus appears in syllabus viewer     │
│  PDFs downloadable from exam detail page │
│  Answer keys linked to questions         │
└──────────────────────────────────────────┘
```

---

## 3. Kerala PSC Portal Structure

These are the specific pages and their HTML patterns:

### 3.1 Examinations Page

**URL:** `https://keralapsc.gov.in/examinations`
**Contains:** Table/list of current and upcoming exams
**Extract per row:** Exam name, category/post, date, notification PDF link, syllabus PDF link
**Maps to:** `exams` table (create or update)

### 3.2 Previous Question Papers

**URL:** `https://keralapsc.gov.in/previous-question-paper`
**Contains:** List of exams with downloadable question paper PDFs
**Extract per row:** Exam name, year, PDF download link(s) — sometimes multiple PDFs per exam (Paper I, Paper II)
**Maps to:** Download PDF → extract questions → `questions` table

### 3.3 OMR Answer Keys

**URL:** `https://keralapsc.gov.in/omr-answer-key`
**Contains:** Table of exams with OMR answer key PDFs
**Pattern:** Usually a table with columns: Sl.No, Name of Exam, Category, Date, Answer Key PDF
**Maps to:** Download PDF → parse answer mapping → update `questions.answer` for matched questions

### 3.4 Online Answer Keys

**URL:** `https://keralapsc.gov.in/online-answer-key`
**Contains:** Similar to OMR but for online exams
**Maps to:** Same as OMR answer keys

### 3.5 Descriptive Exam Question Papers

**URL:** `https://keralapsc.gov.in/question-paper-descriptive-examination`
**Contains:** Essay/descriptive question papers (not MCQ)
**Maps to:** Download PDF → extract descriptive questions with marks → save with type='descriptive'

---

## 4. Database Schema

### 4.1 New Table: `portal_documents`

This table tracks every PDF discovered and processed from portal pages.

```sql
CREATE TABLE portal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Source tracking
  portal_name VARCHAR(255) NOT NULL,       -- "Kerala PSC"
  portal_url VARCHAR(2000) NOT NULL,       -- the page URL where this was found
  source_page_type VARCHAR(30) NOT NULL,
    -- examinations | previous_questions | omr_answer_key
    -- | online_answer_key | descriptive_questions | syllabus | notification

  -- Document info
  document_type VARCHAR(30) NOT NULL,
    -- question_paper_mcq | question_paper_descriptive | answer_key_omr
    -- | answer_key_online | syllabus | notification | other
  title VARCHAR(1000) NOT NULL,            -- "Assistant Professor Pharmacy - Question Paper 2024"
  exam_name VARCHAR(500),                  -- extracted exam name
  exam_year INTEGER,
  exam_category VARCHAR(255),              -- "Assistant Professor", "Pharmacist Gr II"

  -- File storage
  original_url VARCHAR(2000) NOT NULL,     -- original PDF URL on the portal
  file_key VARCHAR(500),                   -- S3 key after download
  file_url VARCHAR(1000),                  -- CloudFront URL
  file_size_bytes INTEGER,
  page_count INTEGER,

  -- Processing
  processing_status VARCHAR(20) NOT NULL DEFAULT 'discovered',
    -- discovered | downloading | downloaded | extracting | processed | error
  raw_text TEXT,                           -- full extracted text from PDF
  extraction_method VARCHAR(50),           -- pdf-parse | claude-vision | gemini

  -- Results
  questions_extracted INTEGER DEFAULT 0,
  answers_matched INTEGER DEFAULT 0,       -- for answer keys: how many matched
  exam_id UUID REFERENCES exams(id),       -- linked exam after matching
  syllabus_id UUID REFERENCES syllabi(id), -- if syllabus was extracted

  -- Metadata
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
    -- { paperNumber, subject, medium, totalMarks, duration }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_portal_docs_portal ON portal_documents(portal_name);
CREATE INDEX idx_portal_docs_type ON portal_documents(document_type);
CREATE INDEX idx_portal_docs_exam ON portal_documents(exam_id);
CREATE INDEX idx_portal_docs_status ON portal_documents(processing_status);
```

### 4.2 Extend `questions` table

Add columns to link questions back to their source document:

```sql
ALTER TABLE questions ADD COLUMN IF NOT EXISTS
  portal_document_id UUID REFERENCES portal_documents(id),
  -- links question to the specific PDF it was extracted from
  paper_year INTEGER,
  -- the year of the question paper
  paper_number VARCHAR(50),
  -- "Paper I", "Paper II", etc.
  question_number INTEGER;
  -- original question number in the paper
```

---

## 5. Where This Plugs Into Existing Modules

```
EXISTING MODULE                    WHAT PORTAL INGESTION ADDS
─────────────────────────────────────────────────────────────

Scraper Manager UI                 "Ingest Portal" button on the
(/admin/scraper)                   Add Source page — accepts a portal
                                   URL and page type selector

Content Finder                     Portal ingestion results appear
(/admin/find)                      in Content Finder search results
                                   as "official" source quality

Exam Discovery Agent               Shares portal-map.ts config.
(discovery-agent.ts)               Discovery finds new exams;
                                   Portal Ingestion downloads the PDFs

Syllabus Pipeline                  When a syllabus PDF is ingested,
                                   it feeds into the existing
                                   syllabus extraction pipeline

Question Bank                      Extracted questions appear in
                                   the platform question bank
                                   with source attribution

Exam Detail Page                   PDFs are downloadable from
(/exams/[id])                      the exam detail page
```

**The Portal Ingestion Pipeline is a NEW WORKER that reuses existing modules:**

- Uses `ai-router.ts` for all AI calls
- Uses existing `QuestionSchema` for MCQ extraction
- Uses existing syllabus extraction prompts for syllabus PDFs
- Saves to existing `questions` and `syllabi` tables
- Managed from existing Scraper Manager admin UI

---

## 6. AI Prompts

### 6.1 Page Structure Extraction

```
SYSTEM:
You extract structured exam information from Indian government PSC portal pages.
These pages typically contain tables or lists of exams with linked PDF documents.

USER:
Extract all exam entries from this portal page.

Portal: {portal_name}
Page type: {page_type}
URL: {url}

=== PAGE CONTENT (HTML or Markdown) ===
{page_content}
=== END ===

For each exam entry, extract:
1. exam_name: the full exam/post name
2. exam_category: post category (e.g., "Assistant Professor", "Pharmacist Grade II")
3. exam_year: year if mentioned
4. date: exam date if shown
5. pdf_links: array of { url, label, type }
   where type is: question_paper | answer_key | syllabus | notification
   and label is the link text (e.g., "Paper I", "Paper II", "Answer Key")
6. additional_info: any other relevant text (medium, subject, marks)

Rules:
- Extract EVERY entry, do not skip any
- PDF links may be relative URLs — include them as-is, I will resolve
- Some entries may have multiple PDFs (Paper I + Paper II + Answer Key)
- If the page has pagination, note the pagination links
- Kerala PSC often uses Sl.No numbered tables

OUTPUT: JSON array matching PortalPageEntrySchema
```

### 6.2 MCQ Extraction from Question Paper PDF

```
SYSTEM:
You extract MCQ questions from Indian competitive exam question papers.
These PDFs follow specific patterns: numbered questions with 4 options (A-D),
sometimes bilingual (English + Malayalam/Hindi), sometimes with diagrams described.

USER:
Extract all MCQ questions from this question paper.

Exam: {exam_name}
Year: {year}
Paper: {paper_number}

=== PDF TEXT ===
{raw_text}
=== END ===

Rules:
1. Extract EVERY question — do not skip any
2. Preserve the original question number
3. Each question: { questionNumber, question, options (4), subject (classify) }
4. If bilingual: extract the English version only
5. If a question references an image/diagram: note "[Diagram: description]"
6. Classify each question's subject based on content
7. Difficulty: estimate based on concept complexity
8. Do NOT guess answers — set answer to -1 (answer keys are processed separately)

OUTPUT: JSON array matching QuestionSchema[] with questionNumber field
```

### 6.3 Answer Key Extraction

```
SYSTEM:
You extract answer keys from Indian exam OMR/online answer key PDFs.
These typically contain: question number → correct option (A/B/C/D or 1/2/3/4).

USER:
Extract the answer key from this document.

Exam: {exam_name}
Year: {year}
Type: {omr | online}

=== PDF TEXT ===
{raw_text}
=== END ===

Rules:
1. Extract EVERY question number → answer mapping
2. Answers may be: A/B/C/D, 1/2/3/4, or (A)/(B)/(C)/(D)
3. Normalize to 0-indexed: A/1 = 0, B/2 = 1, C/3 = 2, D/4 = 3
4. Some answer keys have multiple series (A, B, C, D booklet codes)
   — extract all series
5. If a question is "cancelled" or "bonus", note it with answer = -2

OUTPUT: JSON matching AnswerKeySchema:
{
  series: "A" | "B" | "C" | "D" | "single",
  answers: [{ questionNumber: 1, answer: 0 }, ...]
}
```

### 6.4 Descriptive Question Extraction

```
SYSTEM:
You extract descriptive (essay/written) exam questions from question paper PDFs.
These are NOT MCQ — they require written answers with specific marks per question.

USER:
Extract all descriptive questions from this paper.

Exam: {exam_name}
Year: {year}

=== PDF TEXT ===
{raw_text}
=== END ===

For each question extract:
1. questionNumber: original number
2. question: full question text
3. marks: marks allocated
4. section: which section/part (if paper has parts)
5. type: essay | short_answer | problem | case_study
6. subject: classify the subject area
7. subQuestions: if the question has parts (a, b, c), extract each

OUTPUT: JSON array matching DescriptiveQuestionSchema
```

---

## 7. File Locations

| What               | Where                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| Schema             | `packages/shared/src/db/schema/portal-documents.ts`                   |
| Validators         | `packages/shared/src/validators/portal-ingestion.ts`                  |
| BullMQ Worker      | `apps/api/src/workers/portal-ingestion-worker.ts`                     |
| Page Crawler       | `apps/api/src/services/portal-crawler.ts`                             |
| PDF Processor      | `apps/api/src/services/pdf-processor.ts`                              |
| Answer Key Matcher | `apps/api/src/services/answer-key-matcher.ts`                         |
| AI Prompts         | `apps/api/src/ai/prompts/portal-extraction.ts`                        |
| tRPC additions     | `apps/api/src/routers/scrape-source.ts` (add `ingestPortal` endpoint) |
| Admin UI           | `apps/web/src/app/(dashboard)/admin/scraper/ingest/page.tsx`          |
| Portal config      | `apps/api/src/config/portal-map.ts` (extend existing)                 |

---

## 8. Claude Code Implementation Prompt

> **Feed this to Claude Code. Read @CLAUDE.md first, then this file.**

### STEP 1: Database + Validators

`commit: feat: add portal_documents table and question source tracking`

**1A.** Create `packages/shared/src/db/schema/portal-documents.ts` with
all fields from section 4.1 above.

**1B.** Add columns to existing `questions` table: `portalDocumentId` (uuid FK
nullable), `paperYear` (integer nullable), `paperNumber` (varchar nullable),
`questionNumber` (integer nullable). These link questions to their source PDF.

**1C.** Create `packages/shared/src/validators/portal-ingestion.ts`:

```typescript
export const IngestPortalSchema = z.object({
  url: z.string().url(),
  portalName: z.string().min(1),
  pageType: z.enum([
    "examinations",
    "previous_questions",
    "omr_answer_key",
    "online_answer_key",
    "descriptive_questions",
    "syllabus",
    "notification",
  ]),
  examId: z.string().uuid().optional(), // if known, link to existing exam
});

export const PortalPageEntrySchema = z.object({
  examName: z.string(),
  examCategory: z.string().optional(),
  examYear: z.number().optional(),
  date: z.string().optional(),
  pdfLinks: z.array(
    z.object({
      url: z.string(),
      label: z.string(),
      type: z.enum(["question_paper", "answer_key", "syllabus", "notification", "other"]),
    }),
  ),
  additionalInfo: z.string().optional(),
});

export const AnswerKeySchema = z.object({
  series: z.string(),
  answers: z.array(
    z.object({
      questionNumber: z.number(),
      answer: z.number(), // 0-3 or -2 for cancelled
    }),
  ),
});

export const DescriptiveQuestionSchema = z.object({
  questionNumber: z.number(),
  question: z.string(),
  marks: z.number(),
  section: z.string().optional(),
  type: z.enum(["essay", "short_answer", "problem", "case_study"]),
  subject: z.string(),
  subQuestions: z
    .array(
      z.object({
        label: z.string(),
        question: z.string(),
        marks: z.number(),
      }),
    )
    .optional(),
});
```

**1D.** Export, generate migration, run migration.

### STEP 2: Portal Crawler Service

`commit: feat: add portal page crawler with PDF link discovery`

Create `apps/api/src/services/portal-crawler.ts`:

```typescript
export async function crawlPortalPage(params: {
  url: string;
  portalName: string;
  pageType: string;
}): Promise<PortalPageEntry[]>;
```

Implementation:

1. Fetch the page using **Playwright** (Kerala PSC uses server-side rendering
   but some content loads dynamically). If Playwright is not available, fall
   back to fetching with `fetch()` + Cheerio.
2. Convert page to clean text/markdown (strip navigation, footer, ads).
3. Send to Claude via ai-router with the **Page Structure Extraction** prompt
   (section 6.1). Validate response with Instructor.js + PortalPageEntrySchema[].
4. Resolve relative PDF URLs to absolute using the page's base URL.
   Kerala PSC PDFs are often at paths like `/sites/default/files/...`
   so resolve relative to `https://keralapsc.gov.in`.
5. Return structured entries with resolved PDF links.

If the page has pagination (Kerala PSC sometimes does), detect "Next" links
and crawl subsequent pages too (up to 10 pages max).

### STEP 3: PDF Processor Service

`commit: feat: add PDF download, text extraction, and AI processing`

Create `apps/api/src/services/pdf-processor.ts`:

```typescript
export async function processPDF(params: {
  documentId: string; // portal_documents.id
  pdfUrl: string;
  documentType: string;
  examName: string;
  examYear?: number;
}): Promise<ProcessingResult>;
```

Implementation:

**Download:**

1. Fetch PDF from the URL (with timeout 30s, max 50MB)
2. Upload to S3: `portal-pdfs/{portalName}/{examName}/{filename}`
3. Update portal_documents: fileKey, fileUrl, fileSizeBytes, status='downloaded'

**Text Extraction:**

1. Try `pdf-parse` first (fast, works for text-based PDFs)
2. If pdf-parse returns < 100 chars of text (likely scanned image PDF):
   - Convert PDF pages to images (use `pdf-to-img` or `sharp`)
   - Send to Claude Vision via ai-router for OCR
3. Save rawText to portal_documents
4. Count pages, update portal_documents.pageCount

**AI Processing (based on documentType):**

For `question_paper_mcq`:

1. Send rawText to AI with MCQ extraction prompt (section 6.2)
2. Validate with Instructor.js + QuestionSchema[]
3. For each question: save to `questions` table with:
   - examId (matched or from input)
   - portalDocumentId = this document
   - paperYear, paperNumber, questionNumber
   - source = portal name
   - owner_type = 'platform', visibility = 'public'
   - answer = -1 (answer key not yet applied)
   - type = 'mcq'
4. Deduplicate: check if question with same examId + questionNumber + paperYear exists

For `question_paper_descriptive`:

1. Send to AI with descriptive question extraction prompt (section 6.4)
2. Save to questions table with type = 'descriptive'
3. Store marks, section info in question content JSONB

For `answer_key_omr` or `answer_key_online`:

1. Send to AI with answer key extraction prompt (section 6.3)
2. Get array of { questionNumber, answer } mappings
3. **Match to existing questions**: find questions WHERE
   examId matches AND paperYear matches AND questionNumber matches
   AND answer = -1 (not yet answered)
4. Update each matched question's `answer` field
5. Track: portal_documents.answersMatched = count of matches

For `syllabus`:

1. Send to AI with syllabus extraction prompt (reuse from Syllabus Pipeline)
2. Create syllabi record + syllabus_nodes tree
3. Link: portal_documents.syllabusId = new syllabus

For `notification`:

1. Extract text, save to portal_documents.rawText
2. Create exam_notification record if relevant dates found

Update portal_documents.processingStatus and counts after each type.

### STEP 4: Portal Ingestion Worker

`commit: feat: add BullMQ portal ingestion worker orchestrating full pipeline`

Create `apps/api/src/workers/portal-ingestion-worker.ts`:

This is the orchestrator. BullMQ worker for `ingest-portal` jobs.

**Job data:**

```typescript
interface IngestPortalJob {
  url: string;
  portalName: string;
  pageType: string;
  examId?: string;
}
```

**Flow:**

1. Call `crawlPortalPage()` → get PortalPageEntry[]
2. For each entry:
   a. Try to match examName to existing exam in DB
   (ILIKE match on exams.name + exams.conductingBody)
   b. If no match and pageType = 'examinations': create new exam record
   c. For each pdfLink in the entry:
   - Create portal_documents record (status: discovered)
   - Classify document type from link label + pageType:
     ```
     pageType='previous_questions' + any label → 'question_paper_mcq'
     pageType='descriptive_questions' → 'question_paper_descriptive'
     pageType='omr_answer_key' → 'answer_key_omr'
     pageType='online_answer_key' → 'answer_key_online'
     label contains 'syllabus' → 'syllabus'
     label contains 'notification' → 'notification'
     ```
   - Queue PDF processing: call `processPDF()` for each document
3. Report progress via job.updateProgress()
4. On completion: update all counts, log to scrape_runs

**Processing order matters for answer keys:**

- Process question papers FIRST (creates questions with answer=-1)
- Process answer keys SECOND (matches and updates answers)
- So: sort pdfLinks by type, questions before answers.

**Concurrency:** Process PDFs sequentially within one portal page
(to maintain ordering), but multiple portal ingestion jobs can run
in parallel.

### STEP 5: tRPC Endpoint

`commit: feat: add ingestPortal endpoint to scraper router`

Add to `apps/api/src/routers/scrape-source.ts` (or create a new
`portal-ingestion` router):

```typescript
ingestPortal: adminProcedure
  .input(IngestPortalSchema)
  .mutation(async ({ input, ctx }) => {
    // Create a scrape_runs entry for tracking
    const run = await createScrapeRun(input);

    // Queue the BullMQ job
    const job = await portalIngestionQueue.add('ingest-portal', {
      ...input,
      runId: run.id,
    });

    return { runId: run.id, jobId: job.id };
  }),

getPortalDocuments: adminProcedure
  .input(z.object({
    portalName: z.string().optional(),
    documentType: z.string().optional(),
    processingStatus: z.string().optional(),
    examId: z.string().uuid().optional(),
    page: z.number().default(1),
    limit: z.number().default(20),
  }))
  .query(),
  // Returns portal_documents with filters + pagination

getPortalDocumentById: adminProcedure
  .input(z.object({ id: z.string().uuid() }))
  .query(),
  // Single document with full rawText + linked questions count

reprocessDocument: adminProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(),
  // Re-run AI extraction on an already-downloaded PDF
```

### STEP 6: Admin UI — Portal Ingestion Page

`commit: feat: add portal ingestion admin page`

Create `apps/web/src/app/(dashboard)/admin/scraper/ingest/page.tsx`:

**Layout:**

**Top: Ingestion Form**

- **Portal URL** (text input): paste the URL
- **Portal Name** (auto-detect from domain, editable): "Kerala PSC"
- **Page Type** (select):
  - Examinations (exam listing)
  - Previous Question Papers (MCQ papers)
  - OMR Answer Keys
  - Online Answer Keys
  - Descriptive Question Papers
  - Syllabus / Notification
- **Link to Exam** (optional select): link all extracted content to a specific exam
- **[Ingest Portal]** button

**Quick Links** (for Kerala PSC — pre-configured buttons):

```
Kerala PSC Quick Ingest:
[📋 Examinations] [📝 Question Papers] [📊 OMR Answer Keys]
[💻 Online Answer Keys] [📄 Descriptive Papers]
```

Each button pre-fills the form with the corresponding URL + page type.

**Processing Progress:**
After clicking Ingest:

1. "Crawling page..." → shows exam entries found
2. "Discovered X exams, Y PDFs" → table of discovered entries
3. Per-PDF progress: downloading → extracting text → AI processing → done
4. Summary: "Processed 15 PDFs. Extracted 450 questions. Matched 380 answers."

**Bottom: Document History Table**

- Table of portal_documents with columns:
  Portal, Type, Title, Year, Status, Questions, PDF link, Actions
- Filter by portal, type, status
- Actions: View Text, Reprocess, View Questions, Download PDF

Use shadcn/ui: Input, Select, Button, Table, Badge, Progress, Card.
Poll for progress via tRPC during active ingestion.

### STEP 7: Show ingested content in user-facing pages

`commit: feat: surface portal-ingested content in exam detail and question bank`

**Exam Detail Page** (`/exams/[id]`):

- Add "Question Papers" section showing portal_documents WHERE
  examId = this exam AND documentType IN ('question_paper_mcq', 'question_paper_descriptive')
- Each entry: year, paper name, PDF download button, question count badge
- Add "Answer Keys" section similarly
- Add "Syllabus" link if a syllabus document exists

**Question Bank** (admin + user views):

- Questions extracted from portal papers show:
  - Source badge: "Kerala PSC 2024 Paper I"
  - Year badge
  - Paper number if applicable
- Filter: add "Year" filter dropdown (populated from questions.paperYear)

**User exam practice:**

- When creating a practice session, user can filter by year:
  "Practice 2024 questions only" or "Practice 2022-2024 questions"

### STEP 8: Extend portal-map.ts for all Kerala PSC pages

`commit: feat: add Kerala PSC portal configuration`

Update `apps/api/src/config/portal-map.ts`:

```typescript
export const PORTAL_INGESTION_CONFIGS: Record<string, PortalIngestionConfig[]> = {
  "Kerala PSC": [
    {
      name: "Examinations",
      url: "https://keralapsc.gov.in/examinations",
      pageType: "examinations",
      description: "Current and upcoming exam notifications",
    },
    {
      name: "Previous Question Papers",
      url: "https://keralapsc.gov.in/previous-question-paper",
      pageType: "previous_questions",
      description: "MCQ question papers for all exams",
    },
    {
      name: "OMR Answer Keys",
      url: "https://keralapsc.gov.in/omr-answer-key",
      pageType: "omr_answer_key",
      description: "Official answer keys for OMR-based exams",
    },
    {
      name: "Online Answer Keys",
      url: "https://keralapsc.gov.in/online-answer-key",
      pageType: "online_answer_key",
      description: "Answer keys for online exams",
    },
    {
      name: "Descriptive Question Papers",
      url: "https://keralapsc.gov.in/question-paper-descriptive-examination",
      pageType: "descriptive_questions",
      description: "Essay and descriptive exam papers",
    },
  ],
  // Add more portals later: NTA, UPSC, TNPSC, etc.
};
```

### STEP 9: Post-implementation

`commit: chore: update docs for portal ingestion pipeline`

1. `pnpm lint:fix && pnpm type-check && pnpm build`
2. Update CLAUDE.md: add portal_documents to schema list, note the pipeline
3. Update BACKLOG.md: add Portal Ingestion tasks
4. Test manually:
   - Ingest Kerala PSC previous question papers page
   - Verify PDFs downloaded to S3
   - Verify questions extracted with correct source attribution
   - Ingest OMR answer key page → verify answers matched to existing questions
   - Check exam detail page shows the papers and answer keys
5. Add `.claude/rules/portal-ingestion.md` with patterns

---

## 9. Important Notes

- **Processing order**: always process question papers before answer keys.
  Answer keys need existing questions to match against.
- **Kerala PSC quirks**: some PDFs are scanned images (not text-based).
  The processor must detect this and fall back to Claude Vision OCR.
- **Bilingual content**: Kerala PSC papers often have Malayalam + English.
  Extract English version only for now (Malayalam support in future).
- **Rate limiting**: add 2-second delay between PDF downloads from same portal.
  Government sites may rate-limit or block aggressive crawling.
- **Deduplication**: before saving questions, check for existing questions
  with same examId + paperYear + questionNumber.
- **Error tolerance**: if one PDF fails, continue processing others.
  Log the error but don't abort the entire ingestion.
- **Reprocessing**: the `reprocessDocument` endpoint allows re-running AI
  extraction on already-downloaded PDFs (useful when prompts improve).
