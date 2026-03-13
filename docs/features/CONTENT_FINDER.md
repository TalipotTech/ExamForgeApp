# Feature: Smart Content Finder — AI-Powered Exam Resource Search

> **Status:** Planning
> **Branch:** `feat/content-finder`
> **Priority:** P1 — High-value user feature

---

## 1. Overview

The Smart Content Finder lets users type a natural language query like
_"BPharm Assistant Professor previous year questions Kerala PSC 2023"_
or _"NEET UG 2025 syllabus PDF"_ and the system uses a combination of
AI agents, web search, and targeted scraping to find, extract, and
present the results — ready to save into the user's personal workspace.

```
┌─────────────────────────────────────────────────────┐
│  USER QUERY                                          │
│  "GPAT 2024 previous year questions with answers"    │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│              QUERY INTELLIGENCE                      │
│                                                      │
│  1. Parse intent: previous_questions | syllabus |    │
│     mock_test | study_material | notification        │
│  2. Extract: exam name, year, subject, source pref   │
│  3. Choose search strategy                           │
└──────────────────┬──────────────────────────────────┘
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
     ┌─────────┐ ┌──────┐ ┌──────────┐
     │Perplexity│ │Google│ │ Direct   │
     │ AI Search│ │Custom│ │ Portal   │
     │(web+cite)│ │Search│ │ Scrape   │
     └────┬────┘ └──┬───┘ └────┬─────┘
          │         │          │
          ▼         ▼          ▼
┌─────────────────────────────────────────────────────┐
│              RESULT AGGREGATOR                        │
│                                                      │
│  • Deduplicate across sources                        │
│  • Rank by relevance + recency + source quality      │
│  • Classify: PDF link | web page | direct questions  │
│  • Extract preview content                           │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│              RESULTS PAGE                            │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ 📄 GPAT 2024 Question Paper (PDF)            │   │
│  │    Source: gpatprep.com • PDF • 200 Qs        │   │
│  │    [Preview] [Extract Questions] [Save PDF]   │   │
│  ├──────────────────────────────────────────────┤   │
│  │ 📝 GPAT 2024 Solved Paper — PharmQuiz        │   │
│  │    Source: pharmaquiz.net • HTML • 180 Qs     │   │
│  │    [Preview] [Extract & Save All] [Save Link] │   │
│  ├──────────────────────────────────────────────┤   │
│  │ 📘 GPAT 2024 Answer Key — NTA Official       │   │
│  │    Source: nta.ac.in • PDF • Official          │   │
│  │    [Preview] [Save PDF] [Save Link]           │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  [Load More Results]                                 │
└─────────────────────────────────────────────────────┘
```

---

## 2. User Flow

### 2.1 Search

1. User navigates to **Dashboard → Find Content** (or uses the global search bar)
2. Types a natural language query:
   - "BPharm assistant professor previous questions Kerala PSC"
   - "NEET UG 2025 syllabus PDF download"
   - "Pharmacology MCQs for GPAT with answers"
   - "UPSC prelims 2024 question paper GS Paper 1"
   - "Drug metabolism questions for BPharm exam"
3. Optionally selects filters before or after searching:
   - Content type: Previous Questions | Syllabus | Mock Tests | Study Notes | All
   - Year: 2024, 2023, 2022, Any
   - Format preference: PDF | Web Page | Both
4. Clicks "Search" or presses Enter
5. System shows "Searching across 5 sources..." with animated progress

### 2.2 Results

Results appear as cards, each showing:

- **Title**: extracted or generated from source content
- **Source**: domain name + favicon + credibility badge (Official / Community / Unknown)
- **Content type badge**: PDF | Web | Questions | Syllabus
- **Preview snippet**: first 200 chars or question count
- **Match quality**: High / Medium / Low relevance indicator
- **Actions**:
  - **Preview** → opens side panel with full content preview
  - **Extract Questions** → AI extracts structured MCQs from the content
  - **Save to My Content** → saves the raw resource (PDF/link/text) to user_uploads
  - **Save Questions** → after extraction, saves questions to user's question bank
  - **Save Syllabus** → if syllabus detected, parses tree and saves to user's syllabi

### 2.3 Save Flow

When user clicks "Save to My Content":

1. Content is saved to `user_saved_searches` (the search result metadata)
2. If PDF: downloaded and stored in S3 under user's namespace
3. If web page: content extracted and stored as text
4. If questions detected: optionally extract + save to questions table
5. Saved items appear in Dashboard → Saved Content

When user clicks "Extract Questions":

1. System fetches full page/PDF content
2. Sends to AI (user's allowed provider) for question extraction
3. Shows extracted questions in a review panel
4. User can accept/reject individual questions
5. Accepted questions saved to user's personal question bank
6. Quota is decremented

---

## 3. Search Strategy Engine

### 3.1 Query Parser (AI-powered)

```typescript
interface ParsedQuery {
  intent:
    | "previous_questions"
    | "syllabus"
    | "mock_test"
    | "study_material"
    | "answer_key"
    | "notification"
    | "general";
  examName: string | null; // "GPAT", "NEET UG", "Kerala PSC Asst Prof"
  examYear: number | null; // 2024, 2023, etc.
  subject: string | null; // "Pharmacology", "Physics", etc.
  contentFormat: "pdf" | "web" | "any";
  keywords: string[]; // additional search terms
  specificSource: string | null; // if user mentions "from NTA" or "official"
}
```

### 3.2 Search Strategies (executed in parallel)

| Strategy                 | When                                       | How                                                                           | Cost          |
| ------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------- | ------------- |
| **Perplexity AI Search** | Always (primary)                           | Send parsed query to Perplexity sonar-pro; returns web results with citations | ~$0.005/query |
| **Direct Portal Scrape** | When examName maps to a known portal       | Scrape the specific portal's archive page directly                            | ~$0.002/page  |
| **Internal Database**    | Always                                     | Search existing questions/syllabi/uploads in ExamForge DB                     | Free          |
| **Google Custom Search** | Fallback if Perplexity returns < 3 results | Google Custom Search API with site restrictions                               | ~$0.005/query |
| **Cached Results**       | If same query was run < 24h ago            | Return from Redis cache                                                       | Free          |

### 3.3 Portal Mapping (for direct scrape)

```typescript
const EXAM_PORTAL_MAP: Record<string, DirectScrapeConfig[]> = {
  NEET: [
    { url: "https://nta.ac.in/Download/QP-NEET", type: "pdf_archive", name: "NTA Official" },
    { url: "https://neet.nta.nic.in/previous-year", type: "html", name: "NTA NEET Portal" },
  ],
  GPAT: [
    { url: "https://nta.ac.in/Download/QP-GPAT", type: "pdf_archive", name: "NTA Official" },
    { url: "https://gpatprep.com/previous-papers", type: "html", name: "GPATPrep.com" },
  ],
  UPSC: [
    {
      url: "https://upsc.gov.in/examinations/previous-question-papers",
      type: "pdf_archive",
      name: "UPSC Official",
    },
  ],
  "Kerala PSC": [
    {
      url: "https://keralapsc.gov.in/previous-question-papers",
      type: "html",
      name: "Kerala PSC Official",
    },
  ],
  // ... more mappings
};
```

### 3.4 Result Ranking

Results are scored and ranked:

```typescript
score = relevance * 0.4 + sourceQuality * 0.3 + recency * 0.2 + contentRichness * 0.1;

// relevance: AI-assessed match to query (0-1)
// sourceQuality: official=1.0, established=0.8, community=0.5, unknown=0.3
// recency: newer content scores higher
// contentRichness: has answers=+0.2, has explanations=+0.3, is PDF=+0.1
```

---

## 4. Database Schema

### 4.1 New Tables

```sql
-- Search queries and cached results
CREATE TABLE content_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  query_text TEXT NOT NULL,                    -- raw user query
  parsed_query JSONB NOT NULL,                 -- ParsedQuery from AI
  results_count INTEGER DEFAULT 0,
  search_strategies_used JSONB DEFAULT '[]',   -- ["perplexity", "portal_scrape", "internal"]
  ai_provider VARCHAR(50),
  ai_tokens_used INTEGER DEFAULT 0,
  ai_cost_usd REAL DEFAULT 0,
  cache_key VARCHAR(255),                      -- for Redis caching
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_searches_user ON content_searches(user_id);
CREATE INDEX idx_content_searches_cache ON content_searches(cache_key);

-- Individual search results
CREATE TABLE search_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES content_searches(id) ON DELETE CASCADE,
  title VARCHAR(1000) NOT NULL,
  source_url VARCHAR(2000) NOT NULL,
  source_name VARCHAR(255),                    -- "NTA Official", "PharmQuiz", etc.
  source_domain VARCHAR(255),                  -- "nta.ac.in", "pharmaquiz.net"
  content_type VARCHAR(30) NOT NULL,
    -- pdf | web_page | question_set | syllabus | answer_key | study_material
  snippet TEXT,                                -- preview text (first 300 chars)
  match_quality VARCHAR(10) NOT NULL,          -- high | medium | low
  relevance_score REAL DEFAULT 0,
  source_quality VARCHAR(20) DEFAULT 'unknown',
    -- official | established | community | unknown
  metadata JSONB DEFAULT '{}',
    -- { year, questionCount, hasAnswers, hasExplanations, fileSize, pageCount }
  is_saved BOOLEAN DEFAULT false,              -- user has saved this result
  is_extracted BOOLEAN DEFAULT false,          -- questions have been extracted
  extraction_count INTEGER DEFAULT 0,          -- questions extracted from this result
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_search_results_search ON search_results(search_id);
CREATE INDEX idx_search_results_saved ON search_results(search_id, is_saved)
  WHERE is_saved = true;

-- User's saved content from searches (bookmarks + downloaded content)
CREATE TABLE user_saved_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  search_result_id UUID REFERENCES search_results(id),  -- nullable if manually added
  title VARCHAR(1000) NOT NULL,
  source_url VARCHAR(2000),
  source_name VARCHAR(255),
  content_type VARCHAR(30) NOT NULL,
  saved_type VARCHAR(20) NOT NULL,
    -- bookmark | downloaded_pdf | extracted_text | extracted_questions | saved_syllabus
  file_key VARCHAR(500),                       -- S3 key if PDF downloaded
  file_url VARCHAR(1000),
  raw_text TEXT,                               -- extracted text content
  metadata JSONB DEFAULT '{}',
  exam_id UUID REFERENCES exams(id),
  tags JSONB DEFAULT '[]',
  questions_extracted INTEGER DEFAULT 0,
  owner_type VARCHAR(10) DEFAULT 'user',
  owner_id UUID REFERENCES users(id),
  visibility VARCHAR(20) DEFAULT 'private',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_content_user ON user_saved_content(user_id);
CREATE INDEX idx_saved_content_exam ON user_saved_content(exam_id);
CREATE INDEX idx_saved_content_type ON user_saved_content(user_id, content_type);
```

---

## 5. API Endpoints (tRPC)

```typescript
contentFinderRouter = router({
  // ─── SEARCH ───
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(3).max(500),
        contentType: z
          .enum([
            "all",
            "previous_questions",
            "syllabus",
            "mock_test",
            "study_material",
            "answer_key",
          ])
          .default("all"),
        year: z.number().optional(),
        format: z.enum(["all", "pdf", "web"]).default("all"),
        examId: z.string().uuid().optional(), // scope to specific exam
      }),
    )
    .mutation(),
  // Returns: { searchId, results: SearchResult[], fromCache: boolean }

  getSearchResults: protectedProcedure.input(z.object({ searchId: z.string().uuid() })).query(),

  // ─── PREVIEW ───
  previewResult: protectedProcedure.input(z.object({ resultId: z.string().uuid() })).mutation(),
  // Fetches full content from source URL, returns preview text/HTML

  // ─── EXTRACT ───
  extractQuestions: protectedProcedure
    .input(
      z.object({
        resultId: z.string().uuid(),
        provider: z.enum(["claude", "gemini", "openai", "mistral", "auto"]).default("auto"),
      }),
    )
    .mutation(),
  // Fetches content → AI extraction → returns QuestionSchema[]
  // Does NOT save yet — user reviews first

  saveExtractedQuestions: protectedProcedure
    .input(
      z.object({
        resultId: z.string().uuid(),
        questions: z.array(QuestionSchema), // user-reviewed questions
        examId: z.string().uuid(),
      }),
    )
    .mutation(),
  // Saves to questions table with owner_type='user'

  extractSyllabus: protectedProcedure
    .input(
      z.object({
        resultId: z.string().uuid(),
        provider: z.enum(["claude", "gemini", "openai", "mistral", "auto"]).default("auto"),
      }),
    )
    .mutation(),
  // Fetches content → AI syllabus extraction → returns SyllabusTree
  // User reviews then saves

  // ─── SAVE ───
  saveResult: protectedProcedure
    .input(
      z.object({
        resultId: z.string().uuid(),
        saveType: z.enum(["bookmark", "download_pdf", "extract_text"]),
        examId: z.string().uuid().optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(),
  // bookmark = save metadata only
  // download_pdf = fetch PDF → S3 → save reference
  // extract_text = fetch page → extract text → save

  unsaveResult: protectedProcedure
    .input(z.object({ savedContentId: z.string().uuid() }))
    .mutation(),

  // ─── SAVED CONTENT ───
  listSaved: protectedProcedure
    .input(
      z.object({
        contentType: z.string().optional(),
        examId: z.string().uuid().optional(),
        search: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      }),
    )
    .query(),

  getSavedById: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(),

  // ─── SEARCH HISTORY ───
  getSearchHistory: protectedProcedure.input(z.object({ limit: z.number().default(20) })).query(),
});
```

---

## 6. AI Prompts

### 6.1 Query Parser

```
SYSTEM:
You parse natural language search queries about Indian competitive exams
into structured search parameters.

USER:
Parse this search query: "{user_query}"

Extract:
1. intent: previous_questions | syllabus | mock_test | study_material | answer_key | notification | general
2. examName: exact exam name (null if unclear). Normalize to standard names:
   NEET UG, NEET PG, GPAT, UPSC CSE, Kerala PSC, TNPSC, GATE, UGC NET, FMGE, etc.
3. examYear: specific year mentioned (null if not specified)
4. subject: specific subject (null if whole exam)
5. contentFormat: pdf | web | any
6. keywords: additional search terms not covered above
7. specificSource: if user mentions a source ("from NTA", "official")

OUTPUT: JSON matching ParsedQuerySchema
```

### 6.2 Result Ranker

```
SYSTEM:
You rank search results by relevance to an exam content query.

USER:
Query: {parsed_query}
Results:
{results_array_json}

For each result, assign:
- relevance_score (0.0-1.0): how well it matches the query
- match_quality: "high" | "medium" | "low"
- content_type: classify the result
- estimated_question_count: if it's a question resource
- has_answers: boolean
- has_explanations: boolean

OUTPUT: JSON array with scored results
```

### 6.3 Perplexity Search Prompt

```
Search for: {examName} {year} {intent_as_text}

Find:
1. Official question papers or syllabus from the conducting body's website
2. Solved papers with answer keys from reputable education sites
3. PDF downloads of previous year papers
4. Study material from established coaching/education platforms

Prioritize: official sources (nta.ac.in, upsc.gov.in, state PSC sites),
then established platforms (testbook, unacademy, gradeup), then community resources.

Return results with: title, URL, brief description, source credibility assessment.
```

---

## 7. File Locations

| What          | Where                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Schema        | `packages/shared/src/db/schema/content-searches.ts`, `search-results.ts`, `user-saved-content.ts` |
| Validators    | `packages/shared/src/validators/content-finder.ts`                                                |
| tRPC router   | `apps/api/src/routers/content-finder.ts`                                                          |
| Search engine | `apps/api/src/services/content-search-engine.ts`                                                  |
| Query parser  | `apps/api/src/ai/prompts/query-parser.ts`                                                         |
| Result ranker | `apps/api/src/ai/prompts/result-ranker.ts`                                                        |
| Portal map    | `apps/api/src/config/portal-map.ts`                                                               |
| BullMQ worker | `apps/api/src/workers/content-fetch-worker.ts`                                                    |
| Search page   | `apps/web/src/app/(dashboard)/dashboard/find/page.tsx`                                            |
| Results view  | `apps/web/src/components/content-finder/search-results.tsx`                                       |
| Preview panel | `apps/web/src/components/content-finder/result-preview.tsx`                                       |
| Saved content | `apps/web/src/app/(dashboard)/dashboard/saved/page.tsx`                                           |

---

## 8. Implementation Order

1. Database — 3 new tables + validators + migration
2. Query parser prompt + portal map config
3. Search engine service (orchestrates all strategies)
4. Content fetch worker (downloads pages/PDFs for preview + extraction)
5. tRPC router with all endpoints
6. Search page UI (query input + filters + results cards)
7. Preview panel (side sheet with full content)
8. Extract + save flow (AI extraction → review → save)
9. Saved content page (list + manage bookmarks)
10. Integration into dashboard sidebar + global search bar
