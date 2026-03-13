# BACKLOG Addition — Smart Content Finder (Paste into BACKLOG.md)

---

## Phase 1.7: Smart Content Finder — AI-Powered Search & Save

> Spec: `docs/features/CONTENT_FINDER.md`
> Prompt: `CLAUDE_CODE_CONTENT_FINDER_PROMPT.md`

### Database

- [ ] Create `content_searches` table (query log, parsed query, cache key)
- [ ] Create `search_results` table (per-result: title, URL, type, score, save/extract status)
- [ ] Create `user_saved_content` table (bookmarks, downloads, extracted text, ownership columns)
- [ ] Zod validators: SearchQuerySchema, ParsedQuerySchema, SearchResultSchema, SaveResultSchema
- [ ] Generate migration, export from shared/index.ts

### Search Engine Service

- [ ] Query parser prompt (`query-parser.ts`) — Mistral, returns ParsedQuerySchema
- [ ] Portal map config (`portal-map.ts`) — exam → portal URL mappings
- [ ] Search engine (`content-search-engine.ts`) — orchestrates all strategies:
  - [ ] Strategy: Internal DB search (questions, syllabi, saved content)
  - [ ] Strategy: Perplexity AI web search (sonar-pro, citation parsing)
  - [ ] Strategy: Direct portal scrape (Cheerio/Playwright on known archive URLs)
- [ ] Result deduplication (domain + URL path)
- [ ] Result ranking (source quality + title match + type match + year + extras)
- [ ] Redis caching (24h TTL for results, 1h for previews/extractions)

### Content Fetch Worker (BullMQ)

- [ ] `content-fetch-worker.ts` with job types: preview, extract_questions, extract_syllabus, download_pdf, extract_text
- [ ] Preview: fetch page/PDF first 3 pages, return text
- [ ] Extract questions: full content → AI extraction → return QuestionSchema[] (no save)
- [ ] Extract syllabus: full content → AI extraction → return SyllabusTree (no save)
- [ ] Download PDF: fetch → S3 upload → extract text → create user_saved_content
- [ ] Extract text: fetch HTML → clean → create user_saved_content

### tRPC Router

- [ ] `search` mutation — calls search engine, returns results
- [ ] `getSearchResults` query — load results for a search
- [ ] `previewResult` mutation — triggers preview fetch, returns text
- [ ] `extractQuestions` mutation — triggers AI extraction, returns questions for review
- [ ] `saveExtractedQuestions` mutation — saves reviewed questions to user's question bank
- [ ] `extractSyllabus` mutation — triggers syllabus extraction
- [ ] `saveResult` mutation — bookmark / download PDF / extract text
- [ ] `unsaveResult` mutation — remove saved content + S3 cleanup
- [ ] `listSaved` query — user's saved content with filters
- [ ] `getSavedById` query — single saved item with full content
- [ ] `getSearchHistory` query — last N searches

### Frontend — Search Page (/dashboard/find)

- [ ] Search input with rotating placeholder examples
- [ ] Filter row: content type pills, year dropdown, format pills, exam selector
- [ ] Loading state: "Searching across N sources..." with strategy progress
- [ ] Result cards: icon + title + source badge + snippet + metadata + actions
- [ ] Preview side sheet (shadcn Sheet) with full content
- [ ] Extract questions inline flow: provider selector → progress → checklist → save
- [ ] Save button states: bookmark icon → filled when saved
- [ ] Search history chips (last 5 queries, clickable to re-search)
- [ ] Empty state with example queries
- [ ] Mobile responsive: filters bottom sheet, full-screen preview

### Frontend — Saved Content Page (/dashboard/saved)

- [ ] Tab bar: All | Bookmarks | PDFs | Text | Questions | Syllabi
- [ ] Content cards: title, source, type badge, date, exam badge, tags
- [ ] Actions: View, Extract, Delete, Share
- [ ] Inline tag editing

### Integration

- [ ] Add "Find Content" to dashboard sidebar under TOOLS
- [ ] Add "Saved Content" to sidebar under MY CONTENT with count badge
- [ ] Global search bar in dashboard header → navigates to /dashboard/find?q=
- [ ] Quick Search widget on main dashboard page
- [ ] Rate limiting: 10 searches/hour, 20 extractions/hour per user
