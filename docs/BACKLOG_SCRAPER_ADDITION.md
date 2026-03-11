# BACKLOG Addition — Paste into BACKLOG.md after Phase 1.5

---

## Phase 1.6: Exam Discovery & Intelligent Scraping ← NEXT

> Full spec: `docs/features/EXAM_DISCOVERY_SCRAPER.md`
> AI Prompts: `docs/prompts/SCRAPER_PROMPTS.md`

### Database (Schema + Migration)

- [ ] Alter `exams` table — add status, dates, official_url, conducting_body, level, tags, etc.
- [ ] Alter `scrape_sources` table — add source_type, frequency, depth, counters, etc.
- [ ] Create `exam_notifications` table — date changes, new exams, syllabus updates
- [ ] Create `scrape_runs` table — per-run history with page/question counts, cost
- [ ] Create `discovery_runs` table — agent run logs with portals checked
- [ ] Add Zod validators for all new/altered tables
- [ ] Generate migration `0003_exam_discovery_scraper.sql`
- [ ] Update seed script with 10 sample exams (various categories, statuses, dates)

### Backend — Question Scraper Worker

- [ ] Create `apps/api/src/workers/scraper-worker.ts` (BullMQ)
- [ ] Cheerio integration for static HTML scraping
- [ ] Crawlee + Playwright integration for JS-rendered pages
- [ ] PDF download + pdf-parse for PDF question banks
- [ ] AI question extraction prompt via ai-router
- [ ] Dedup: exact hash + embedding cosine similarity (0.92 threshold)
- [ ] Save to questions table with source attribution
- [ ] Update scrape_sources counters after each run
- [ ] scrape_runs logging (pages, questions, errors, cost)
- [ ] Rate limiting: configurable delay between pages
- [ ] Test scrape endpoint (single page, returns preview)

### Backend — Exam Discovery Agent

- [ ] Create `apps/api/src/workers/discovery-agent.ts` (BullMQ)
- [ ] Configure portal list (NTA, UPSC, Kerala PSC, PCI, etc.)
- [ ] Firecrawl integration for portal page fetching
- [ ] AI exam extraction prompt (dates, eligibility, pattern)
- [ ] Match against existing exams (name + body similarity)
- [ ] Auto-create new exams (is_auto_discovered=true, status=draft)
- [ ] Update existing exams on date/syllabus changes
- [ ] Create exam_notifications for all changes
- [ ] discovery_runs logging
- [ ] BullMQ repeatable: daily for NTA/UPSC, weekly for state PSCs

### Backend — tRPC Routers

- [ ] `apps/api/src/routers/scrape-source.ts` — CRUD + scrape triggers + run history
- [ ] `apps/api/src/routers/exam.ts` — public listing + filters + featured + discovery

### Frontend — Scraper Management (Admin)

- [ ] Source list page with table: name, URL, exam, type, status, questions, actions
- [ ] Add Source form: name, URL, type, exam, frequency, depth, format, AI provider, notes
- [ ] "Test Scrape" button with inline question preview
- [ ] Source detail page: run history, error log, scraped questions
- [ ] Live scrape log panel (polling during active scrapes)
- [ ] Stats bar: total sources, active, questions scraped, today's yield
- [ ] Filter/search on source list

### Frontend — Public Exam Catalog (/exams)

- [ ] Exam listing page with filter sidebar (category, status, level, search, sort)
- [ ] Exam cards: name, body, date countdown, category badge, question count, CTA
- [ ] URL param sync for filters (/exams?category=pharmacy&status=upcoming)
- [ ] SEO: dynamic generateMetadata based on filters
- [ ] Pagination (cursor-based load more)
- [ ] Mobile: filter bottom sheet, stacked cards
- [ ] Empty state

### Frontend — Home Page Exam Showcase

- [ ] Featured exams section (3 cards, is_featured=true)
- [ ] Upcoming exams section (nearest 3 by date)
- [ ] Countdown badges on upcoming cards
- [ ] "View All Exams →" link
- [ ] Responsive: 3→2→1 column grid

### Frontend — Exam Detail Page (/exams/[id])

- [ ] Full exam info: dates, eligibility, pattern, conducting body
- [ ] Notification feed (date changes, registration, results)
- [ ] Linked syllabus (if uploaded)
- [ ] Question bank preview (by subject)
- [ ] "Start Practice" / "Start Mock Test" CTAs
