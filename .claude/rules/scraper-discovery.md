# Exam Discovery & Scraping Pipeline Rules

## Feature Context

Two systems: (A) Exam Discovery Agent (LLM finds new exams from portals),
(B) Question Scraper (user-added sources → extract questions).
Full spec: @docs/features/EXAM_DISCOVERY_SCRAPER.md

## Key Files

- Schema changes: `exams.ts` (add columns), `scrape-sources.ts` (add columns)
- New tables: `exam-notifications.ts`, `scrape-runs.ts`, `discovery-runs.ts`
- Workers: `scraper-worker.ts`, `discovery-agent.ts`
- Routers: `scrape-source.ts`, `exam.ts`
- Prompts: `question-extraction.ts`, `exam-discovery.ts`, `source-analysis.ts`

## Scraping Conventions

- ALL scraping respects rate limits: `SCRAPER_RATE_LIMIT_MS` env var
- Never scrape without a corresponding `scrape_runs` entry
- Always log errors to `scrape_runs.error_log` JSONB
- Update `scrape_sources` counters after every run
- Dedup is mandatory: exact hash + semantic similarity (0.92 threshold)
- Source attribution: every scraped question must have `source` field

## Discovery Agent Conventions

- Auto-discovered exams start as `status='draft'`
- Admin must review before making public (unless auto-approve is on)
- Always create `exam_notifications` for date changes
- `is_auto_discovered=true` on all agent-created exams
- `last_checked_at` updated on every portal check, even if no changes
- Use Perplexity for portals that change frequently (NTA, UPSC)
- Use Claude for parsing complex notification PDFs

## Exam Listing — Public Routes

- `/exams` is PUBLIC (no auth) — must be SEO-friendly
- Use Next.js generateMetadata for dynamic SEO per filter
- Cache exam listings aggressively (TanStack Query staleTime: 5min)
- Featured exams: `is_featured=true`, curated by admin
- Upcoming: `exam_date > now()`, ordered by nearest date first
- Popularity: based on question_count + user exam_sessions count

## BullMQ Job Names

- `scrape-questions` — per-source scraping
- `discover-exams` — portal monitoring (repeatable)
- `test-scrape` — single-page test run (priority: high)
