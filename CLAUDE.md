# ExamForge - AI Exam Preparation Platform

## Project Overview

ExamForge is a vertical AI platform for exam preparation in India. Primary target: BPharm Assistant Professor. Expanding to NEET, GPAT, UPSC, State PSCs, GATE.

## Architecture

- Monorepo managed by Turborepo
- `apps/web` — Next.js 15 (App Router) + TypeScript + Tailwind v4 + shadcn/ui
- `apps/api` — Fastify 5 + tRPC v11 + BullMQ workers
- `packages/shared` — Shared types, validators (Zod), constants
- `infra/` — AWS CDK (TypeScript) — App Runner, RDS, ElastiCache, S3, CloudFront

## Tech Stack

- Runtime: Node.js 22 LTS, TypeScript 5.5+ strict mode
- ORM: Drizzle ORM with PostgreSQL 17 + pgvector
- State: Zustand (client), TanStack Query v5 (server state)
- AI: Vercel AI SDK 4.0, Instructor.js for structured output
- AI Providers: Claude (primary), Gemini (video), Mistral (bulk)
- Queue: BullMQ backed by Redis 7 (ElastiCache)
- Auth: NextAuth.js v5 + MSG91 OTP
- Payments: Razorpay

## Commands

- `pnpm dev` — Start all apps in dev mode (Turborepo)
- `pnpm build` — Production build all packages
- `pnpm test` — Run Vitest across all packages
- `pnpm test:e2e` — Playwright E2E tests (apps/web)
- `pnpm lint` — ESLint + Prettier check
- `pnpm lint:fix` — Auto-fix lint issues
- `pnpm db:generate` — Generate Drizzle migrations
- `pnpm db:migrate` — Run pending migrations
- `pnpm db:studio` — Open Drizzle Studio
- `pnpm infra:deploy` — CDK deploy to AWS
- `pnpm infra:diff` — CDK diff (preview changes)

## Code Conventions

- 2-space indentation, no tabs
- ES modules only (`import`/`export`, never `require`)
- Named exports preferred over default (except Next.js pages)
- Prefer `const` over `let`, never `var`
- All functions: explicit return types
- Zod schemas for ALL API input validation
- Error pattern: `{ success: true, data } | { success: false, error }`
- Files: kebab-case. Components: PascalCase. Utils: camelCase.
- One component per file, co-locate styles and tests

## AI Integration Rules

- NEVER hardcode API keys — environment variables only
- ALL LLM responses validated via Instructor.js/Zod before DB save
- Use `ai-router.ts` for model selection — never call providers directly
- Log all AI calls: provider, model, tokens, latency, cost estimate
- Retry with exponential backoff (max 3) for all AI calls
- Cache identical prompts in Redis (TTL: 24h)

## Database Rules

- Every table: `id` (UUID), `created_at`, `updated_at`, `exam_id`
- Drizzle migrations only — never modify schema manually
- Filter by `org_id` on all user-data queries (multi-tenancy)
- JSONB for flexible fields (options, translations, metadata)

## Testing

- Vitest + @testing-library/react for components
- Vitest + supertest for Fastify routes
- Playwright for E2E (login, exam-taking, payment)
- Min 80% coverage on shared + api packages
- Test files: `*.test.ts` co-located with source

## Git Workflow

- Branches: `feat/`, `fix/`, `chore/`, `docs/` prefixes
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`
- Always PR — never push to `main` directly
- Squash merge to `main`

## AWS

- Region: ap-south-1 (Mumbai) — ALWAYS
- IaC: AWS CDK TypeScript in `infra/`
- Envs: `dev`, `staging`, `prod`
- Secrets: AWS Secrets Manager, never .env in prod
- Container registry: ECR, tags = git SHA

## Feature Areas (entry points)

Multi-stage AI pipelines. All workers run via `pnpm --filter @examforge/api worker:dev`.

- **Syllabus Intelligence** — upload PDF → `syllabus-processor` worker → `syllabus_nodes` tree → `tutorial-agent-worker` → `tutorials` / `tutorial_questions`. Router: `syllabus`, `tutorial-agent`. Spec: `docs/features/SYLLABUS_PIPELINE.md`.
- **Portal Ingestion** — admin adds source → `portal-ingestion-worker` discovers PDFs → `portal-processing-worker` extracts questions → `staged_questions` → admin review → `questions`. Router: `portal-ingestion`, `scrape-source`. Spec: `docs/features/EXAM_DISCOVERY_SCRAPER.md`.
- **Content Finder** — natural-language search → Perplexity + portal scrape + internal DB → ranked results → save/extract. Router: `content-finder`. Spec: `docs/features/CONTENT_FINDER.md`.
- **Exam Pattern Intelligence** — questions → `pattern-analysis-worker` (classify-paper → analyze-pattern) → `paper_analysis` / `exam_patterns`. Generation: `examPattern.generatePatternExam`. Router: `exam-pattern`. Migration: 0019.
- **Universal Discovery v2** — `official-portals.ts` registry (26 portals across pharmacy / medical / engineering / civil services / banking / SSC / teaching + aggregators) → `universal-discovery-worker` (broad / deep / validate) → `exams.contentCompleteness` JSONB. Admin UI: `/admin/discovery`. Router: `exam` (runUniversalDiscovery, runDeepDiscovery, getPortalStatus, getExamInventory). Migration: 0020.
- **AI Image Generation** — multi-model router (SEPARATE from text `ai-router.ts`). `image-router.ts` maps `purpose` → best model (GPT Image 1.5 for diagrams, Ideogram 3.0 for text-heavy/formula cards, Imagen 4 Fast for thumbnails, GPT Image 1 Mini for budget) with per-purpose fallback, budget-aware downgrade (≥70% → cheap for decorative, ≥90% → mini, ≥100% → throw), prompt enhancement (`image-prompts/prompt-enhancer.ts`), provider calls (`image-providers/{openai,google,ideogram}-image.ts`, all direct HTTP `fetch`), pluggable storage (`services/image-storage.ts`: `local` driver → filesystem at `IMAGE_STORAGE_DIR`, served at `/api/images/*`, works on a Railway Volume; `s3` driver → `lib/s3.ts`, also AWS-S3-compatible R2 — switch via `IMAGE_STORAGE_DRIVER`), and logs to `image_generations`. Shared across examforge | padvik (set `platform`). Router: `imageGeneration` (generate / getStats / getHistory). Admin UI: stats card on `/admin/settings` (`components/admin/image-gen-stats.tsx`). Tutorial-agent diagram enrichment is opt-in via `TUTORIAL_DIAGRAM_GENERATION=true` (non-fatal). Future hook points marked with `// TODO: image-gen` (marketplace cover, creator thumbnail, doubt visualization, pattern chart). **Topic images**: context-derived (not hand-typed) — `image-prompts/image-brief.ts` (`derive_image_brief` AI task) reads a topic's title/keyTerms/tutorial text → decides `needsImage` + writes a precise brief; `image-sync-worker.ts` (queue `image-sync`, router `imageGeneration.syncSyllabus`/`getSyncStatus`) batch-generates per syllabus, idempotent via `syllabus_nodes.image_content_hash` (unchanged topics skipped), pauses on budget. Images attach to `syllabus_nodes` (`image_url`/`image_key`/`image_status`/`image_content_hash`) and link via `image_generations.syllabus_node_id`. Admin UI: test panel + sync panel + stats on `/admin/settings`. Migrations: 0028 (table), 0029 (topic linkage + node columns). Env: `GOOGLE_AI_API_KEY`, `IDEOGRAM_API_KEY`, `IMAGE_S3_BUCKET`, `IMAGE_CLOUDFRONT_DOMAIN`, `IMAGE_MONTHLY_BUDGET_USD` (reuses `OPENAI_API_KEY`). Spec: `docs/features/ai-image-gen/AI_IMAGE_GENERATION.md`.
- **Question Acquisition / Verification** — every question carries a 6-tier trust badge (§1.2): 🟢 real paper / 🔵 textbook / 🟡 verified AI / 🟠 topic AI / ⚪ supplementary. `verification-worker` runs a 6-layer pipeline (source trust → factual (GPT-4o 2nd opinion) → syllabus alignment → pattern match → uniqueness (pgvector) → aggregate) and writes `verification_status`, `verification_score`, and a per-layer audit trail to `question_verifications`. Layer-2 factual verification is **category-aware** — `verification-references.ts` has 5 category blocks (pharmacy / medical_ug / engineering with per-branch CS/EC/ME/EE/CE / civil_services / banking_ssc), each with textbook list + fact-check addendum + common-errors checklist; `inferVerificationCategory(examName, subject)` picks the right block per question. Cross-exam questions (e.g. GPAT used for Kerala PSC prep) get a `relevanceToTarget` score from `exam-overlap-matrix.ts` (symmetric lookup across 5 clusters). `topic-generation-worker` uses ≥3 real/textbook seeds per syllabus node (`syllabusNodeId OR mappedSyllabusNodeId`) and auto-queues verification on every generated question. Admin UIs: `/admin/verification` (review queue + drawer), `/admin/generation` (topic-seeded generation). Routers: `questionVerification`, `topicGeneration`. Migrations: 0021 (aliases), 0022 (verification columns + audit table). Spec: `docs/features/QUESTION_ACQUISITION_STRATEGY.md` + `docs/features/CLAUDE_CODE_UNIVERSAL_STRATEGY_PROMPT.md`.

## Autonomous Data Flow (post-ingestion)

```
portal-ingestion  →  portal-processing  →  classify-paper
                                              ↓ (auto, ≥3 papers)
                                          analyze-pattern
                                              ↓ (auto)
                                          validate-exam (contentCompleteness)
                                              ↓ (auto, per classified question)
                                          verify-question (6-layer pipeline)
```

All auto-triggers are non-fatal — a failure logs a warning but doesn't fail the upstream job.
