# Claude Code Implementation — Smart Content Finder

> **Read first:** `@CLAUDE.md`, then `@docs/features/CONTENT_FINDER.md`
> **Context:** The user types a natural language query like "GPAT 2024 previous
> year questions with answers" and the system searches the web + known portals +
> internal DB, presents ranked results, lets the user preview/extract/save.
> **Execute steps in order. Each step = one commit.**

---

## STEP 1: Database schema + validators

`commit: feat: add content finder schema (searches, results, saved content)`

### 1A. Create `content_searches` table

Create `packages/shared/src/db/schema/content-searches.ts`:

```
id              uuid PK default gen_random_uuid()
userId          uuid NOT NULL FK → users.id
queryText       text NOT NULL                    — raw user query
parsedQuery     jsonb NOT NULL                   — structured ParsedQuery from AI
resultsCount    integer default 0
searchStrategiesUsed  jsonb default '[]'          — ["perplexity","portal_scrape","internal"]
aiProvider      varchar(50) nullable
aiTokensUsed    integer default 0
aiCostUsd       real default 0
cacheKey        varchar(255) nullable             — MD5 of normalized query for Redis
createdAt       timestamp NOT NULL default now()
```

Indexes: on userId, on cacheKey.

### 1B. Create `search_results` table

Create `packages/shared/src/db/schema/search-results.ts`:

```
id              uuid PK
searchId        uuid NOT NULL FK → content_searches.id ON DELETE CASCADE
title           varchar(1000) NOT NULL
sourceUrl       varchar(2000) NOT NULL
sourceName      varchar(255) nullable             — "NTA Official", "PharmQuiz"
sourceDomain    varchar(255) nullable             — "nta.ac.in"
contentType     varchar(30) NOT NULL              — pdf | web_page | question_set | syllabus | answer_key | study_material
snippet         text nullable                     — first 300 chars preview
matchQuality    varchar(10) NOT NULL              — high | medium | low
relevanceScore  real default 0
sourceQuality   varchar(20) default 'unknown'     — official | established | community | unknown
metadata        jsonb default '{}'                — { year, questionCount, hasAnswers, fileSize }
isSaved         boolean default false
isExtracted     boolean default false
extractionCount integer default 0
sortOrder       integer default 0
createdAt       timestamp NOT NULL default now()
```

Indexes: on searchId, on (searchId, isSaved) WHERE isSaved = true.

### 1C. Create `user_saved_content` table

Create `packages/shared/src/db/schema/user-saved-content.ts`:

```
id              uuid PK
userId          uuid NOT NULL FK → users.id
searchResultId  uuid FK → search_results.id nullable  — null if manually added
title           varchar(1000) NOT NULL
sourceUrl       varchar(2000) nullable
sourceName      varchar(255) nullable
contentType     varchar(30) NOT NULL
savedType       varchar(20) NOT NULL              — bookmark | downloaded_pdf | extracted_text | extracted_questions | saved_syllabus
fileKey         varchar(500) nullable             — S3 key if PDF downloaded
fileUrl         varchar(1000) nullable
rawText         text nullable                     — extracted text content
metadata        jsonb default '{}'
examId          uuid FK → exams.id nullable
tags            jsonb default '[]'
questionsExtracted  integer default 0
ownerType       varchar(10) default 'user'
ownerId         uuid FK → users.id
visibility      varchar(20) default 'private'
createdAt       timestamp NOT NULL default now()
updatedAt       timestamp NOT NULL default now()
```

Indexes: on userId, on examId, on (userId, contentType).

### 1D. Create Zod validators

Create `packages/shared/src/validators/content-finder.ts`:

```typescript
import { z } from "zod";

export const SearchQuerySchema = z.object({
  query: z.string().min(3).max(500),
  contentType: z
    .enum(["all", "previous_questions", "syllabus", "mock_test", "study_material", "answer_key"])
    .default("all"),
  year: z.number().min(2010).max(2030).optional(),
  format: z.enum(["all", "pdf", "web"]).default("all"),
  examId: z.string().uuid().optional(),
});

export const ParsedQuerySchema = z.object({
  intent: z.enum([
    "previous_questions",
    "syllabus",
    "mock_test",
    "study_material",
    "answer_key",
    "notification",
    "general",
  ]),
  examName: z.string().nullable(),
  examYear: z.number().nullable(),
  subject: z.string().nullable(),
  contentFormat: z.enum(["pdf", "web", "any"]),
  keywords: z.array(z.string()),
  specificSource: z.string().nullable(),
});

export const SearchResultSchema = z.object({
  title: z.string(),
  sourceUrl: z.string().url(),
  sourceName: z.string().optional(),
  sourceDomain: z.string().optional(),
  contentType: z.enum([
    "pdf",
    "web_page",
    "question_set",
    "syllabus",
    "answer_key",
    "study_material",
  ]),
  snippet: z.string().optional(),
  matchQuality: z.enum(["high", "medium", "low"]),
  relevanceScore: z.number().min(0).max(1),
  sourceQuality: z.enum(["official", "established", "community", "unknown"]).default("unknown"),
  metadata: z.record(z.any()).default({}),
});

export const SaveResultSchema = z.object({
  resultId: z.string().uuid(),
  saveType: z.enum(["bookmark", "download_pdf", "extract_text"]),
  examId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
});

export const ExtractQuestionsSchema = z.object({
  resultId: z.string().uuid(),
  provider: z.enum(["claude", "gemini", "openai", "mistral", "auto"]).default("auto"),
});
```

### 1E. Export and generate migration

1. Export all new schemas from `packages/shared/src/db/schema/index.ts`
2. Export validators from `packages/shared/src/validators/index.ts`
3. Export both from `packages/shared/src/index.ts`
4. `pnpm db:generate && pnpm db:migrate`

---

## STEP 2: Search engine service + query parser + portal map

`commit: feat: add content search engine with multi-strategy search`

### 2A. Create the query parser prompt

Create `apps/api/src/ai/prompts/query-parser.ts`:

Export `buildQueryParserPrompt(userQuery: string)` that returns system + user
prompts. The AI must return JSON matching ParsedQuerySchema.

System prompt (concise version):

```
You parse exam content search queries into structured parameters.
Normalize exam names to standard forms: NEET UG, NEET PG, GPAT,
UPSC CSE, Kerala PSC, TNPSC, GATE, UGC NET, FMGE.
Detect intent: are they looking for previous questions, syllabus,
mock tests, study material, or answer keys?
Extract year if mentioned. Identify subject if specified.
Return JSON matching the schema provided.
```

Use Instructor.js with ParsedQuerySchema for validation.
Provider: use Mistral (fastest + cheapest for classification tasks).

### 2B. Create the portal map config

Create `apps/api/src/config/portal-map.ts`:

```typescript
export interface PortalConfig {
  name: string;
  domain: string;
  searchUrl?: string; // URL pattern for searching this portal
  archiveUrl?: string; // URL for previous papers archive
  syllabusUrl?: string;
  quality: "official" | "established" | "community";
}

export const EXAM_PORTAL_MAP: Record<string, PortalConfig[]> = {
  "NEET UG": [
    {
      name: "NTA Official",
      domain: "nta.ac.in",
      archiveUrl: "https://nta.ac.in/Download/QP-NEET",
      quality: "official",
    },
    { name: "NTA NEET Portal", domain: "neet.nta.nic.in", quality: "official" },
  ],
  GPAT: [
    {
      name: "NTA Official",
      domain: "nta.ac.in",
      archiveUrl: "https://nta.ac.in/Download/QP-GPAT",
      quality: "official",
    },
    {
      name: "GPAT Prep",
      domain: "gpatprep.com",
      archiveUrl: "https://gpatprep.com/previous-papers",
      quality: "established",
    },
  ],
  "UPSC CSE": [
    {
      name: "UPSC Official",
      domain: "upsc.gov.in",
      archiveUrl: "https://upsc.gov.in/examinations/previous-question-papers",
      quality: "official",
    },
  ],
  "Kerala PSC": [
    {
      name: "Kerala PSC Official",
      domain: "keralapsc.gov.in",
      archiveUrl: "https://keralapsc.gov.in/previous-question-papers",
      quality: "official",
    },
  ],
  GATE: [{ name: "GATE Official", domain: "gate2026.iitb.ac.in", quality: "official" }],
  "UGC NET": [
    {
      name: "NTA Official",
      domain: "nta.ac.in",
      archiveUrl: "https://nta.ac.in/Download/QP-UGC-NET",
      quality: "official",
    },
  ],
  FMGE: [{ name: "NBEMS Official", domain: "natboard.edu.in", quality: "official" }],
};

// Generic sources that work for most exams
export const GENERIC_SOURCES: PortalConfig[] = [
  { name: "Testbook", domain: "testbook.com", quality: "established" },
  { name: "Gradeup/BYJU's Exam Prep", domain: "byjusexamprep.com", quality: "established" },
  { name: "Unacademy", domain: "unacademy.com", quality: "established" },
  { name: "Embibe", domain: "embibe.com", quality: "established" },
  { name: "PharmQuiz", domain: "pharmaquiz.net", quality: "community" },
];
```

### 2C. Create the search engine service

Create `apps/api/src/services/content-search-engine.ts`:

This is the core orchestrator. Export a class or function:

```typescript
export async function searchContent(params: {
  userId: string;
  query: string;
  filters: { contentType; year; format; examId };
  aiProvider?: string;
}): Promise<{ searchId: string; results: SearchResult[]; fromCache: boolean }>;
```

**Implementation flow:**

1. **Check cache**: Generate cache key = MD5 of `query + contentType + year + format`.
   Check Redis for existing results (TTL: 24 hours). If hit, return cached results
   and create a new content_searches row pointing to cached data.

2. **Parse query**: Send to AI (Mistral, cheapest) with query-parser prompt.
   Validate with Instructor.js + ParsedQuerySchema. This gives us: intent,
   examName, year, subject, keywords.

3. **Build search strategies**: Based on parsed query, determine which strategies to run:

   ```typescript
   const strategies: SearchStrategy[] = [];

   // Always search internal DB first
   strategies.push({ type: "internal", priority: 1 });

   // If we know the exam, try direct portal scrape
   if (parsedQuery.examName && EXAM_PORTAL_MAP[parsedQuery.examName]) {
     strategies.push({
       type: "portal_scrape",
       portals: EXAM_PORTAL_MAP[parsedQuery.examName],
       priority: 2,
     });
   }

   // Always do a Perplexity web search
   strategies.push({ type: "perplexity_search", priority: 3 });
   ```

4. **Execute strategies in parallel** using `Promise.allSettled()`:

   **Internal DB search**:

   ```sql
   -- Search existing questions
   SELECT 'question_set' as content_type, subject as title, COUNT(*) as question_count
   FROM questions
   WHERE (owner_type = 'platform' OR owner_id = $userId)
     AND exam_id = $examId  -- if known
     AND (question ILIKE $searchTerm OR subject ILIKE $searchTerm)
   GROUP BY subject;

   -- Search existing syllabi
   SELECT * FROM syllabi
   WHERE (owner_type = 'platform' OR owner_id = $userId)
     AND name ILIKE $searchTerm;

   -- Search saved content
   SELECT * FROM user_saved_content
   WHERE user_id = $userId AND title ILIKE $searchTerm;
   ```

   **Perplexity search**:
   Call Perplexity sonar-pro via ai-router with a search-optimized prompt:

   ```
   Find {parsedQuery.examName} {parsedQuery.examYear} {parsedQuery.intent as readable text}.
   Look for: official question papers, solved papers, syllabus PDFs.
   Prioritize official sources. Return each result with: title, URL, description.
   ```

   Parse the citations from Perplexity's response into SearchResult objects.

   **Direct portal scrape**:
   For each portal in the exam's map:
   - Fetch the archive/search page via Cheerio (static) or Playwright (JS)
   - Look for links matching the year/subject
   - Extract: link title, URL, file type (PDF/HTML), estimated content

5. **Aggregate and deduplicate**: Merge results from all strategies.
   Deduplicate by domain + URL path. Prefer official sources over community.

6. **Rank results**: Use a simple scoring formula:

   ```typescript
   function scoreResult(result, parsedQuery): number {
     let score = 0;
     // Source quality
     if (result.sourceQuality === "official") score += 0.3;
     else if (result.sourceQuality === "established") score += 0.2;
     else if (result.sourceQuality === "community") score += 0.1;

     // Title match
     if (result.title.toLowerCase().includes(parsedQuery.examName?.toLowerCase() || ""))
       score += 0.2;
     if (parsedQuery.examYear && result.title.includes(String(parsedQuery.examYear))) score += 0.15;

     // Content type match
     if (
       parsedQuery.intent === "previous_questions" &&
       ["pdf", "question_set"].includes(result.contentType)
     )
       score += 0.2;
     if (parsedQuery.intent === "syllabus" && result.contentType === "syllabus") score += 0.2;

     // Format preference
     if (parsedQuery.contentFormat === "pdf" && result.contentType === "pdf") score += 0.1;

     // Has answers/explanations
     if (result.metadata?.hasAnswers) score += 0.05;

     return Math.min(score, 1.0);
   }
   ```

7. **Save to DB**: Insert content_searches row + search_results rows.
   Cache in Redis with 24h TTL.

8. **Return results** sorted by relevanceScore DESC.

---

## STEP 3: Content fetch worker for preview and extraction

`commit: feat: add content fetch worker for previews and extraction`

Create `apps/api/src/workers/content-fetch-worker.ts` (BullMQ).

This worker handles fetching full content when user clicks Preview, Extract,
or Save on a search result. It runs as a background job so the API doesn't
time out on slow pages/large PDFs.

**Job types:**

```typescript
type ContentFetchJob =
  | { type: "preview"; resultId: string }
  | { type: "extract_questions"; resultId: string; provider: string; userId: string }
  | { type: "extract_syllabus"; resultId: string; provider: string; userId: string }
  | { type: "download_pdf"; resultId: string; userId: string }
  | { type: "extract_text"; resultId: string; userId: string };
```

**For preview**:

1. Load search_result by id, get sourceUrl
2. If URL ends in .pdf: download (max 20MB), extract first 3 pages text with pdf-parse
3. If URL is HTML: fetch with Cheerio, extract main content (strip nav/ads/footer), take first 2000 chars
4. Return preview text (store in Redis with 1h TTL keyed by resultId)

**For extract_questions**:

1. Fetch full content (same as preview but get everything)
2. Send to AI provider via ai-router with question-extraction prompt
3. Validate via Instructor.js + QuestionSchema[]
4. Return extracted questions (DO NOT save — user reviews first)
5. Store extracted questions in Redis (1h TTL) for the review step

**For extract_syllabus**:

1. Fetch full content
2. Send to AI with syllabus-extraction prompt
3. Validate via SyllabusTreeSchema
4. Return tree (user reviews then saves)

**For download_pdf**:

1. Download PDF from URL
2. Upload to S3 under `users/{userId}/saved/{filename}`
3. Extract text with pdf-parse
4. Create user_saved_content row with fileKey, fileUrl, rawText

**For extract_text**:

1. Fetch HTML page
2. Extract clean text content (strip HTML)
3. Create user_saved_content row with rawText

---

## STEP 4: tRPC router

`commit: feat: add content finder tRPC router`

Create `apps/api/src/routers/content-finder.ts`:

All endpoints are `protectedProcedure` (require auth).

### search

Input: SearchQuerySchema.

1. Call `searchContent()` from the search engine service
2. Return `{ searchId, results, fromCache, totalResults }`
3. Quota: count as 1 AI call if not cached (for token tracking)

### getSearchResults

Input: `{ searchId }`.
Query search_results WHERE searchId, ordered by sortOrder.
Include the parent content_searches row for context (query text, parsed query).

### previewResult

Input: `{ resultId }`.

1. Check Redis for cached preview
2. If not cached: queue content-fetch-worker job (type: preview), wait for result
   Use BullMQ's `job.waitUntilFinished(queueEvents, 30000)` with 30s timeout
3. Return preview text

### extractQuestions

Input: ExtractQuestionsSchema.

1. Check user's quota (questions_generated + count < limit)
2. Queue content-fetch-worker job (type: extract_questions)
3. Wait for result (timeout 60s — extraction takes longer)
4. Return extracted QuestionSchema[] for user review
5. Do NOT save yet, do NOT decrement quota yet

### saveExtractedQuestions

Input: `{ resultId, questions: QuestionSchema[], examId }`.

1. For each accepted question:
   - Save to questions table with owner_type='user', owner_id=ctx.userId
   - Set source = search_result.sourceName
   - Set examId from input
2. Update search_results: isExtracted=true, extractionCount=questions.length
3. Increment user's quota: questionsGenerated += count
4. Return saved count

### extractSyllabus

Input: `{ resultId, provider }`.
Similar to extractQuestions but uses syllabus extraction prompt.
Returns SyllabusTree for review.

### saveResult

Input: SaveResultSchema.

1. If bookmark: create user_saved_content with just metadata (no content fetch)
2. If download_pdf: queue worker job, create user_saved_content when done
3. If extract_text: queue worker job, create user_saved_content when done
4. Mark search_results.isSaved = true
5. Return the saved content ID

### unsaveResult

Input: `{ savedContentId }`.
Delete from user_saved_content. If S3 file exists, delete it too.
Mark search_results.isSaved = false.

### listSaved

Input: `{ contentType?, examId?, search?, page, limit }`.
Query user_saved_content WHERE userId = ctx.userId, with filters.
Order by createdAt DESC.

### getSavedById

Input: `{ id }`.
Return single user_saved_content with full rawText.

### getSearchHistory

Input: `{ limit }`.
Query content_searches WHERE userId, ordered by createdAt DESC.
Return just query text + results count + timestamp (not full results).

### Register router

Add `contentFinder: contentFinderRouter` to the app router.

---

## STEP 5: Search page UI

`commit: feat: add content finder search page with results`

Create `apps/web/src/app/(dashboard)/dashboard/find/page.tsx`.

This is a **"use client"** page with rich interactivity.

### Layout:

**Top section — Search bar:**

- Large prominent input: "Search for previous questions, syllabus, study material..."
- Pre-filled placeholder rotates: "GPAT 2024 previous year questions" → "NEET UG syllabus 2025" → "Pharmacology MCQs with answers"
- Filter row below input:
  - Content type: pill buttons (All | Questions | Syllabus | Mock Tests | Study Material)
  - Year: dropdown (Any | 2025 | 2024 | 2023 | 2022)
  - Format: pill buttons (All | PDF | Web)
  - Exam selector: dropdown of user's registered exams + "Any Exam"
- Search button + keyboard shortcut (Enter)

**Middle section — Results:**

While searching: "Searching across 5 sources..." with progress animation
showing each strategy: ✓ Internal DB | ⟳ Perplexity Search | ⟳ Portal Scrape

Results as cards, each containing:

1. **Left icon**: PDF icon (red) | Web icon (blue) | Question icon (green) | Syllabus icon (purple)
2. **Title** (bold, link-like)
3. **Source line**: source domain + credibility badge:
   - Official: green shield badge
   - Established: blue checkmark badge
   - Community: gray badge
   - Unknown: no badge
4. **Snippet**: 2 lines of preview text, truncated
5. **Metadata badges**: year, question count, "Has Answers", "Has Explanations", file size
6. **Match quality**: colored dot (green=high, amber=medium, gray=low)
7. **Action buttons** (right side):
   - **Preview** (eye icon) → opens side panel
   - **Extract Questions** (sparkle icon) → triggers AI extraction
   - **Save** (bookmark icon) → saves to user's content
   - If already saved: filled bookmark + "Saved" label

Clicking **Preview** opens a **side sheet** (shadcn Sheet, right side, 500px):

- Full preview text (or first 3 pages of PDF)
- Source link (opens in new tab)
- Larger action buttons: Extract Questions, Extract Syllabus, Download PDF, Save

Clicking **Extract Questions**:

1. Shows provider selector (inline, compact) — based on user's plan
2. Starts extraction: progress bar "Extracting questions with Claude..."
3. On completion: shows extracted questions in a review list below the result card
4. Each question: checkbox (checked by default) + question text + options + answer
5. User unchecks any bad ones
6. "Save X Questions" button → calls saveExtractedQuestions
7. Toast: "15 questions saved to your Question Bank"

### Empty state (no results):

"No results found for your search. Try different keywords or a broader query."
Suggestions: "Try: 'NEET 2024 question paper', 'GPAT syllabus', 'Pharmacology MCQs'"

### Search history (below results):

"Recent Searches" section showing last 5 queries as clickable chips.
Clicking re-runs the search.

### Data fetching:

- `trpc.contentFinder.search.useMutation()` — triggered on form submit
- `trpc.contentFinder.previewResult.useMutation()` — on preview click
- `trpc.contentFinder.extractQuestions.useMutation()` — on extract click
- `trpc.contentFinder.saveResult.useMutation()` — on save click
- `trpc.contentFinder.getSearchHistory.useQuery({ limit: 5 })` — for history chips

Use shadcn/ui: Input, Button, Badge, Sheet, Card, Skeleton, Checkbox, Tabs.
Mobile: search filters stack vertically, results single column, sheet becomes full-screen.

---

## STEP 6: Saved content page

`commit: feat: add saved content page for managing bookmarks and downloads`

Create `apps/web/src/app/(dashboard)/dashboard/saved/page.tsx`.

### Layout:

**Header**: "My Saved Content" + count

**Filter tabs**: All | Bookmarks | Downloaded PDFs | Extracted Text | Questions | Syllabi

**Content grid**: cards for each saved item:

- Title, source, content type badge, saved date
- Tags (editable)
- Exam badge (if linked to an exam)
- Stats: questions extracted count
- Actions: View, Extract Questions (if not already), Delete, Share (if Pro+)

Fetch: `trpc.contentFinder.listSaved.useQuery({ contentType: activeTab })`

---

## STEP 7: Integrate into dashboard + sidebar

`commit: feat: integrate content finder into dashboard navigation`

1. Add "Find Content" link to the dashboard sidebar under TOOLS section,
   with a search icon. Path: `/dashboard/find`

2. Add "Saved Content" link under MY CONTENT section.
   Path: `/dashboard/saved`. Show count badge from `listSaved` query.

3. Add a **global search bar** in the dashboard top bar:
   - Compact input in the header
   - On focus: expands
   - On submit: navigates to `/dashboard/find?q={query}`
   - The find page reads `searchParams.q` and auto-searches on mount

4. On the main dashboard page, add a "Quick Search" widget:
   - "Find previous papers, syllabus, or study material"
   - Input field + search button
   - Shows last 3 search queries as chips below

---

## STEP 8: Post-implementation

`commit: chore: update docs and backlog for content finder`

1. `pnpm lint:fix && pnpm type-check && pnpm build`
2. Update CLAUDE.md: add Content Finder to active features, note new tables
3. Update BACKLOG.md: add Content Finder tasks, check off completed ones
4. Update TASKS_COMPLETED.md: document what was built
5. Add sidebar nav item: "🔍 Find Content" under Tools
6. Add sidebar nav item: "📌 Saved Content" under My Content
7. Update `.claude/rules/` if needed with content-finder patterns
8. Verify ownership scoping: all saved content uses owner_type='user'

---

## KEY PATTERNS TO FOLLOW

**Caching**: Every search result set is cached in Redis for 24 hours.
Cache key = MD5 of normalized (lowercased, trimmed) query + filters.
Preview content cached for 1 hour. Extracted questions cached for 1 hour.

**Quota**: Each search costs 1 AI call (for query parsing). Each extraction
costs based on content size. Track in user_ai_quotas. If cached, no quota cost.

**Ownership**: All saved content gets owner_type='user', owner_id=ctx.userId.
Extracted questions get owner_type='user'. Use `getOwnershipForUser(ctx)`.

**Error handling**: If Perplexity search fails, continue with portal scrape.
If portal scrape fails, return Perplexity results only. If all fail, return
internal DB results only. Never show an error to user if at least one strategy
returned results. Only show error if ALL strategies fail AND internal DB is empty.

**Rate limiting**: Max 10 searches per user per hour. Max 20 extractions per
user per hour. Enforce via Redis counter with TTL.
