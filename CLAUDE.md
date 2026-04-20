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
- **Universal Discovery v2** — `official-portals.ts` registry (13 portals) → `universal-discovery-worker` (broad / deep / validate) → `exams.contentCompleteness` JSONB. Admin UI: `/admin/discovery`. Router: `exam` (runUniversalDiscovery, runDeepDiscovery, getPortalStatus, getExamInventory). Migration: 0020.

## Autonomous Data Flow (post-ingestion)

```
portal-ingestion  →  portal-processing  →  classify-paper
                                              ↓ (auto, ≥3 papers)
                                          analyze-pattern
                                              ↓ (auto)
                                          validate-exam (contentCompleteness)
```

All three auto-triggers are non-fatal — a failure logs a warning but doesn't fail the upstream job.
