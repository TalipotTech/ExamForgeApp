# ADR: AI Tutor / RAG Infra Decisions

> **Status:** Accepted
> **Date:** 2026-05-13
> **Scope:** Pre-coding decisions for the AI tutor / RAG feature. Lock these before writing retrieval, embedding, or chat code.

---

## Context

The AI tutor lets a student open a chat against any piece of content — a tutorial, a syllabus node, a lecture video, an uploaded PDF — and ask grounded questions. That requires three pieces of infra that don't exist yet:

1. An embedding pipeline (text → vectors).
2. A transcription pipeline (video/audio → text, so embeddings can run on it).
3. A vector store for retrieval.

Each has a few viable options. This ADR records the chosen path and why, so feature code can be written without re-litigating the choice in PR review.

---

## Decisions

### D1 — Embeddings: background worker primary, on-the-fly fallback

**Choice:** Dual-track. `embedding-worker` (BullMQ) handles the steady state; an inline embed branch covers cache misses.

**Primary path — background worker:**
- Triggered on `tutorial.published`, `syllabus.node.created`, and at the tail of the portal-ingestion pipeline.
- Reuses the existing BullMQ infra (Redis 7 / ElastiCache) — no new runtime.
- Result: first chat against any published content is instant.

**Fallback path — on-the-fly:**
- If a chat request lands on content with no embedding row (race with the worker, worker backlog, user-uploaded PDF, freshly-generated tutorial), embed inline and persist.
- Same code path as the worker; the chat handler just owns the cache-miss branch.

**Why not on-the-fly only?** ~30s first-request latency on a 10-minute video is a non-starter for a tutor UX. Background eliminates that for the 99% case.

**Why not background only?** Creates a hard "embeddings not ready, try again later" state that's hostile to user-uploaded content and dev iteration. The fallback is ~20 lines of code and removes the failure mode entirely.

### D2 — Transcription: Gemini 2.0 Flash primary, OpenAI Whisper API fallback

**Choice:** Dual-track behind `ai-router.ts`. Same multi-agent retry pattern we already use for question generation.

**Primary — Gemini 2.0 Flash audio:**
- Cheaper than Whisper per minute.
- Native video support — no ffmpeg-extract-audio step for lecture videos.
- Already wired up via `ai-router.ts`; zero new provider integration.

**Fallback — OpenAI Whisper API ($0.006/min):**
- Best-in-class accuracy across accents and Indian languages.
- Predictable per-minute pricing, no rate-limit surprises.
- Auto-triggered when Gemini fails, returns low-confidence output, or for languages where Whisper measurably wins (Hindi / Tamil / Malayalam — to be benchmarked on real content).

**Rejected — local whisper.cpp:** free at the margin, but needs a GPU-attached worker host. Not worth the infra cost at current volume.

**Wiring:** add `transcription.provider` selector to `ai-router.ts`. Log `provider`, `model`, `latency_ms`, `estimated_cost_usd` to `ai_usage_logs` per call (per `.claude/rules/ai-patterns.md`) so we can compare quality/cost on real data and adjust the default later.

### D3 — Vector DB: pgvector (solo, not dual-track)

**Choice:** pgvector in our existing Postgres 17 / RDS. No managed vector vendor.

**Why solo (and not dual-track like D1/D2):** vector DB choice is genuinely binary. Dual-writing to two stores creates consistency headaches and burns budget with no current upside.

**Why pgvector:**
- Already deployed in `ap-south-1`. No new vendor, no new IAM role, no new secret in Secrets Manager.
- HNSW index pattern already documented in `.claude/rules/database.md`. Handles millions of vectors comfortably — we're nowhere near that.
- Embeddings live in the same transaction boundary as `questions` / `tutorial_questions` rows. Stays in sync without a separate reconciliation job.

**Rejected — Pinecone / Weaviate:** managed convenience doesn't outweigh adding a vendor at current scale.

**Revisit triggers** (any one of):
- `questions.embedding` row count exceeds 5M.
- p95 ANN query latency exceeds 200ms after HNSW tuning.
- Cross-region read replicas needed specifically for vector search.

Until one of those fires, one store.

---

## Implementation Notes

- All three pieces route through `ai-router.ts` or `multi-agent.ts` per the existing AI rules. Feature code does not import provider SDKs directly.
- Embeddings: OpenAI `text-embedding-3-small` (1536 dims) per `.claude/rules/ai-patterns.md`. This ADR does not change the embedding model — only where/when embeddings are produced.
- Every transcription and embedding call logs to `ai_usage_logs` with `feature='ai-tutor'` so we can attribute cost.
- Cache identical transcription requests in Redis (24h TTL) — same pattern as the existing prompt cache.

---

## Open Questions (not blocking)

- Chunking strategy (fixed-size vs. semantic split) — defer until first retrieval-quality eval.
- Re-ranking layer (cross-encoder over top-N hits) — defer; measure baseline first.
- Per-language embedding model variants for Hindi/Tamil/Malayalam content — defer until we have measured retrieval quality on the multilingual `translations` JSONB.
