# Smart Content Finder Rules

## Feature Context

Natural language search → AI parses query → multi-strategy search
(Perplexity + portal scrape + internal DB) → ranked results → preview/extract/save.
Full spec: @docs/features/CONTENT_FINDER.md

## Key Files

- Search engine: `apps/api/src/services/content-search-engine.ts`
- Portal map: `apps/api/src/config/portal-map.ts`
- Query parser prompt: `apps/api/src/ai/prompts/query-parser.ts`
- Fetch worker: `apps/api/src/workers/content-fetch-worker.ts`
- Router: `apps/api/src/routers/content-finder.ts`
- Search page: `apps/web/src/app/(dashboard)/dashboard/find/page.tsx`
- Saved page: `apps/web/src/app/(dashboard)/dashboard/saved/page.tsx`

## Search Flow

1. Parse query with Mistral (cheapest) via Instructor.js → ParsedQuerySchema
2. Build strategies: internal DB (always) + portal scrape (if exam known) + Perplexity (always)
3. Execute all with Promise.allSettled
4. Deduplicate by domain + URL path
5. Score and rank: sourceQuality*0.3 + titleMatch*0.2 + typeMatch*0.2 + yearMatch*0.15 + extras\*0.15
6. Cache in Redis (24h TTL), save to DB

## Caching Strategy

- Search results: Redis, key = MD5(normalized_query + filters), TTL = 24h
- Preview content: Redis, key = `preview:${resultId}`, TTL = 1h
- Extracted questions: Redis, key = `extracted:${resultId}`, TTL = 1h
- If cache hit: skip AI call, no quota cost, return cached

## Save Types

- `bookmark` — metadata only, no content fetched. Cheapest.
- `downloaded_pdf` — PDF fetched from URL, stored in S3 users/{userId}/saved/
- `extracted_text` — HTML fetched, cleaned, stored as rawText
- `extracted_questions` — AI extracts MCQs, user reviews, saves to questions table
- `saved_syllabus` — AI extracts tree, user reviews, saves to syllabi/syllabus_nodes

## Ownership

All saved content: owner_type='user', owner_id=ctx.userId, visibility='private'
Extracted questions: saved to questions table with same ownership
Portal map and search logic are platform-level (not per-user)

## BullMQ Jobs

- `content-search` — NOT a job, runs inline in the mutation (fast enough)
- `content-fetch` — background job for preview/extract/download (can be slow)
  Types: preview | extract_questions | extract_syllabus | download_pdf | extract_text

## Quota Impact

- Search (not cached): 1 AI call (query parsing via Mistral, ~500 tokens)
- Perplexity search: 1 Perplexity call (~$0.005)
- Extract questions: 1 AI call (varies by content size, ~2000-8000 tokens)
- Preview/bookmark/download: no AI cost
