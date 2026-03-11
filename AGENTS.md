# AGENTS.md — ExamForge

## Project

AI-powered exam preparation platform for Indian competitive exams. Monorepo: Next.js 15 + Fastify 5 + PostgreSQL 17 + AWS.

## Current Status (March 2026)

- DB: 8 tables live, 2 migrations, seed script, dev login working
- Auth: NextAuth v5 with credentials, middleware-protected dashboard
- Landing page live, API server running
- Active feature: Syllabus Intelligence Pipeline (PDF → AI extraction → tutorials → MCQ)

## Stack

- Language: TypeScript 5.5+ strict, ES modules only
- Frontend: Next.js 15 App Router, Tailwind v4, shadcn/ui, Zustand, TanStack Query v5
- Backend: Fastify 5, tRPC v11, BullMQ, Drizzle ORM
- Database: PostgreSQL 17 (RDS) + pgvector, Redis 7 (ElastiCache)
- AI: Vercel AI SDK 4.0, Instructor.js, Claude + Gemini + OpenAI + Mistral + Perplexity
- Document AI: pdf-parse, Unstructured.io, Claude Vision, Gemini long-context
- Infra: AWS CDK (TypeScript), App Runner, S3, CloudFront
- Test: Vitest, Playwright, @testing-library/react

## Conventions

- 2-space indent, semicolons, single quotes
- Named exports (except Next.js pages)
- Zod validation on all API inputs
- Drizzle ORM only (no raw SQL except migrations)
- Every DB table has: id (UUID), created_at, updated_at
- Conventional Commits: feat:, fix:, chore:, docs:
- PR required for all changes to main

## File Structure

```
apps/web/src/          — Next.js pages, components, hooks
apps/api/src/          — Fastify routes, tRPC routers, AI services, workers
apps/api/src/ai/       — AI router, prompts, provider configs
apps/api/src/workers/  — BullMQ workers (scraper, generator, syllabus processor)
packages/shared/src/   — Zod schemas, DB schema, types, constants
packages/shared/src/db/schema/ — All Drizzle table definitions
infra/                 — AWS CDK stacks
docs/                  — Architecture, features, prompts, AWS guides
```

## Important Files

- `apps/api/src/ai/ai-router.ts` — Central AI provider routing
- `apps/api/src/ai/multi-agent.ts` — Fan-out to multiple providers, merge results
- `packages/shared/src/db/schema/` — All Drizzle table definitions
- `packages/shared/src/validators/` — Zod schemas for questions, exams, syllabus
- `infra/lib/examforge-stack.ts` — Main CDK stack
- `BACKLOG.md` — Task tracking with checkboxes
- `TASKS_COMPLETED.md` — Completed work log
- `docs/features/SYLLABUS_PIPELINE.md` — Active feature spec

## Multi-Agent AI Pattern

Users choose which providers to use for any AI task:

- Single provider: route to selected provider
- Multi-agent: fan-out to all selected, merge best results
- Always validate with Instructor.js/Zod before saving
- Track cost per provider in ai_usage_logs

## Do NOT

- Hardcode API keys or secrets
- Use `any` type
- Use `require()` — ES modules only
- Call AI providers directly — use ai-router.ts / multi-agent.ts
- Push to main without PR
- Use localStorage in components (use server state)
- Write raw SQL outside migrations
- Remove `.js` extensions workaround (Turbopack issue, already fixed)
