# Exam Discovery & Scraping — AI Prompts

---

## 1. Question Extraction from Web Content

### Use in: `apps/api/src/ai/prompts/question-extraction.ts`

### Provider: User-selected (default: Claude for quality, Mistral for bulk)

```
SYSTEM:
You are an expert at extracting exam questions from educational web content.
You identify MCQs, true/false questions, fill-in-the-blank, match-the-following,
and assertion-reason questions from raw HTML/text content of Indian exam
preparation websites.

USER:
Extract all exam questions from the following content.

Source: {source_name} ({source_url})
Target Exam: {exam_name}
Content Type: {content_type} (HTML | PDF text | OCR text)

=== CONTENT ===
{raw_content}
=== END CONTENT ===

Rules:
1. Extract EVERY question found — do not skip any
2. For each question, identify:
   - question: the full question text
   - options: array of options (["A) ...", "B) ...", "C) ...", "D) ..."])
   - answer: index of correct answer (0-3). If answer key is absent, set to -1
   - explanation: provided explanation, or "" if none
   - subject: classify the subject area
   - difficulty: estimate difficulty (easy/medium/hard)
   - type: mcq | true_false | fill_blank | match | assertion
3. Clean up formatting artifacts (HTML tags, weird characters, OCR errors)
4. If the content has numbered questions, preserve the numbering context
5. If the content is an answer key, match answers to their question numbers
6. Ignore ads, navigation text, headers, footers — only extract Q&A content
7. If content has both English and Hindi, extract the English version
8. For image-referenced questions, describe what the image likely shows

OUTPUT: JSON array matching QuestionSchema[] (via Instructor.js)
If NO questions found, return empty array [].
```

---

## 2. Exam Discovery from Official Portals

### Use in: `apps/api/src/ai/prompts/exam-discovery.ts`

### Provider: Claude (primary) or Perplexity (for web-search-backed)

```
SYSTEM:
You are an expert analyst of Indian government examination portals. You
extract structured exam information from notification pages, news sections,
and press releases published by exam conducting bodies in India.

USER:
Analyze the following content from an official exam portal and extract
all exam-related announcements, notifications, and updates.

Portal: {portal_name} ({portal_url})
Page type: {page_type} (notifications | news | results | calendar)
Date checked: {current_date}

=== PAGE CONTENT ===
{page_content_markdown}
=== END CONTENT ===

For each exam announcement found, extract:
1. exam_name: Official name (e.g., "NEET UG 2026", "Kerala PSC Assistant Professor")
2. conducting_body: Organization conducting the exam
3. category: pharmacy | medical | civil_services | state_psc | engineering | other
4. level: national | state | university
5. dates: {
     exam_date: "YYYY-MM-DD" or null,
     registration_start: "YYYY-MM-DD" or null,
     registration_end: "YYYY-MM-DD" or null,
     result_date: "YYYY-MM-DD" or null,
     admit_card_date: "YYYY-MM-DD" or null
   }
6. official_url: direct link to the notification/advertisement
7. application_url: link to apply (if found)
8. syllabus_url: link to syllabus PDF (if found)
9. eligibility: brief eligibility summary
10. exam_pattern: { total_marks, duration_minutes, negative_marking, sections }
11. is_new: true if this seems like a new announcement, false if routine update
12. change_type: "new_exam" | "date_change" | "registration_open" | "result_declared"
    | "syllabus_update" | "admit_card" | "correction_window" | "general_update"
13. summary: one-line summary of the notification

Rules:
- Only extract exam-related content, not general government notices
- Parse Indian date formats (DD/MM/YYYY, DD-MMM-YYYY, "15th March 2026")
- If dates are tentative, still extract with a note in the summary
- Distinguish between different stages of the same exam (Prelims vs Mains)
- For state PSCs, include the state name in conducting_body

OUTPUT: JSON matching DiscoveredExamSchema[] (via Instructor.js)
```

---

## 3. Auto-Categorize Scrape Source

### Use in: `apps/api/src/ai/prompts/source-analysis.ts`

### Provider: Mistral (fast + cheap for classification)

```
SYSTEM:
You analyze educational websites and classify them for an exam preparation
platform's web scraping system.

USER:
Analyze this website and determine what type of content it contains.

URL: {url}
Page title: {page_title}
First 500 chars: {content_preview}

Determine:
1. source_type: question_bank | previous_year | mock_test | syllabus | notes | blog | portal | other
2. target_exams: array of exam names this site likely serves
   (e.g., ["NEET", "GPAT"] or ["BPharm Assistant Professor"])
3. content_format: html | pdf_links | images | mixed
4. estimated_questions: rough estimate of extractable questions (0 if not a Q&A site)
5. scrape_complexity: easy (static HTML) | medium (pagination/JS) | hard (login wall/CAPTCHA)
6. language: english | hindi | bilingual | regional
7. quality_estimate: high | medium | low (based on content structure)
8. recommended_frequency: daily | weekly | monthly | once

OUTPUT: JSON matching SourceAnalysisSchema
```

---

## 4. Claude Code Prompts

### Create Scraper Worker

```
Create apps/api/src/workers/scraper-worker.ts — a BullMQ worker for
web scraping questions from user-added sources.

Architecture (see docs/features/EXAM_DISCOVERY_SCRAPER.md section 4.1):
1. Receive job: { sourceId, runId }
2. Load source config from DB (URL, depth, content format, AI provider)
3. Create scrape_runs entry (status: running)
4. Fetch pages:
   - Static HTML → Cheerio
   - JS-rendered → Playwright via Crawlee
   - PDF links → download + pdf-parse
5. For each page of content:
   a. Send to AI provider (via ai-router) with question-extraction prompt
   b. Validate each extracted question via Instructor.js + QuestionSchema
   c. Dedup check: hash-based (exact) + embedding similarity (semantic > 0.92)
   d. Save new questions to DB with source attribution
6. Emit progress events via BullMQ job.updateProgress()
7. On completion: update scrape_runs + scrape_sources counters
8. On error: log to scrape_runs.error_log, set source status if persistent

Rate limiting: configurable delay between page fetches (env: SCRAPER_RATE_LIMIT_MS)
Concurrency: configurable (env: SCRAPER_CONCURRENCY, default 3)
Follow CLAUDE.md conventions. Use ai-router.ts for all AI calls.
```

### Create Discovery Agent

```
Create apps/api/src/workers/discovery-agent.ts — a BullMQ worker that
uses LLM agents to discover new exams and track changes.

Architecture (see docs/features/EXAM_DISCOVERY_SCRAPER.md section 4.2):
1. Load portal list from DB or config (see section 4.3 for portals)
2. For each portal:
   a. Fetch notifications/news page via Firecrawl (→ clean markdown)
   b. Send to Claude/Perplexity with exam-discovery prompt
   c. Validate response via Instructor.js + DiscoveredExamSchema[]
3. For each discovered exam:
   a. Match against existing exams (name similarity + conducting body)
   b. New exam → insert with is_auto_discovered=true, status=draft
   c. Existing + dates changed → update dates + create notification
   d. Existing + no change → update last_checked_at only
4. Log run to discovery_runs table
5. Schedule: repeatable BullMQ job (daily for major portals, weekly for others)

Use Perplexity for portals that need real-time web search context.
Use Claude for parsing complex notification PDFs.
Follow CLAUDE.md conventions.
```

### Create Exam Listing tRPC Router

```
Create apps/api/src/routers/exam.ts — public + admin endpoints for exams.

Public endpoints (no auth required):
- listPublic: paginated listing with filters (category, status, level, search, sort)
- getFeatured: exams where is_featured=true, ordered by exam_date
- getUpcoming: exams where exam_date > now(), limit N
- getById: single exam with full details + notification count + question count

Admin endpoints (require admin role):
- update: edit exam details
- toggleFeatured: set/unset featured flag
- runDiscovery: manually trigger discovery agent
- getDiscoveryRuns: history of discovery runs

Search implementation:
- Use PostgreSQL full-text search on: name, conducting_body, eligibility
- Also search JSONB tags array
- Fuzzy match with pg_trgm for typo tolerance

Follow existing router patterns. Use Zod validators from shared package.
```

---

## 5. Cursor Prompts

### Scrape Source Management Page

```
Create the scraper management page at apps/web/src/app/(dashboard)/scraper/page.tsx

Requirements:
- Table/card list of all scrape sources with columns:
  Name, URL, Exam, Type, Status, Last Scraped, Questions, Actions
- Status indicators: active (green), paused (yellow), error (red), pending (gray)
- Actions per source: Edit, Scrape Now, Pause/Resume, View History, Delete
- "Add Source" button → opens add/edit form (see below)
- Stats bar at top: total sources, active sources, total questions scraped, today's yield
- Scrape log panel (bottom): real-time log of recent scrape activity
- Filter: by exam, status, source type
- Search: by name or URL

Use shadcn/ui: Table, Badge, Button, DropdownMenu (actions), Input (search).
Follow .cursor/rules/project.mdc conventions.
```

### Add/Edit Source Form

```
Create the add source form at apps/web/src/app/(dashboard)/scraper/add/page.tsx
(also used for edit: apps/web/src/app/(dashboard)/scraper/[id]/edit/page.tsx)

Form fields:
- Name (text input, required): e.g., "PharmQuiz Daily MCQs"
- Website URL (URL input, required): validated URL format
- Source Type (select): Question Bank | Previous Year Papers | Mock Tests | Syllabus | Notes
- Target Exam (select, from DB): or "Auto-detect"
- Scrape Frequency (select): Manual Only | Daily | Weekly | Monthly
- Scrape Depth (number, 1-10): pages to follow from entry URL
- Content Format (select): HTML | PDF | Images (Scanned)
- AI Provider (select): Claude | Gemini | OpenAI | Mistral | Auto (Cheapest)
- Notes (textarea, optional): special instructions for the scraper

Actions:
- "Test Scrape" button: runs single-page test, shows preview of extracted Qs
- "Save & Activate": creates source and schedules first scrape
- "Save as Draft": saves without activating

After "Test Scrape": show extracted questions in a preview card below the form.
Use shadcn/ui: Card, Input, Select, Textarea, Button, Separator.
Validate with Zod on client + server.
```

### Public Exam Listing Page

```
Create the public exam listing page at apps/web/src/app/exams/page.tsx

Requirements:
- Header: "All Exams" with search bar
- Filter sidebar (left, collapsible on mobile):
  - Category: checkboxes (Pharmacy, Medical, Civil Services, State PSC, Engineering)
  - Status: radio (All, Upcoming, Active, Past)
  - Level: checkboxes (National, State, University)
  - Sort: select (Date, Popularity, Questions Available, Name)
- Exam cards grid (right):
  - Each card shows:
    - Exam name (bold)
    - Conducting body (subtitle)
    - Date badge (countdown if upcoming, "Completed" if past)
    - Category badge (color-coded)
    - Question count badge
    - Syllabus status indicator
    - "Start Practice" CTA button
  - Pagination at bottom
- Empty state: "No exams match your filters"
- URL params for filters: /exams?category=pharmacy&status=upcoming

Server Component for initial data, client-side filtering for instant UX.
Use TanStack Query with URL search params sync.
Use shadcn/ui: Card, Badge, Input, Checkbox, RadioGroup, Select, Skeleton.
SEO: dynamic metadata based on filters.
Mobile: filter sidebar becomes bottom sheet.
```
