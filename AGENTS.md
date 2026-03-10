# AGENTS.md — ExamForge

## Project
AI-powered exam preparation platform for Indian competitive exams. Monorepo: Next.js 15 + Fastify 5 + PostgreSQL 17 + AWS.

## Stack
- Language: TypeScript 5.5+ strict, ES modules only
- Frontend: Next.js 15 App Router, Tailwind v4, shadcn/ui, Zustand, TanStack Query v5
- Backend: Fastify 5, tRPC v11, BullMQ, Drizzle ORM
- Database: PostgreSQL 17 (RDS) + pgvector, Redis 7 (ElastiCache)
- AI: Vercel AI SDK 4.0, Instructor.js, Claude + Gemini + Mistral
- Infra: AWS CDK (TypeScript), App Runner, S3, CloudFront
- Test: Vitest, Playwright, @testing-library/react

## Conventions
- 2-space indent, semicolons, single quotes
- Named exports (except Next.js pages)
- Zod validation on all API inputs
- Drizzle ORM only (no raw SQL except migrations)
- Every DB table has: id (UUID), created_at, updated_at, exam_id
- Conventional Commits: feat:, fix:, chore:, docs:
- PR required for all changes to main

## File Structure
```
apps/web/src/          — Next.js pages, components, hooks
apps/api/src/          — Fastify routes, tRPC routers, AI services, workers
packages/shared/src/   — Zod schemas, DB schema, types, constants
infra/                 — AWS CDK stacks
docs/                  — Architecture docs, prompts, AWS guides
```

## Important Files
- `apps/api/src/ai/ai-router.ts` — Central AI provider routing
- `packages/shared/src/db/schema/` — All Drizzle table definitions
- `packages/shared/src/validators/` — Zod schemas for questions, exams
- `infra/lib/examforge-stack.ts` — Main CDK stack
- `apps/web/src/app/` — Next.js App Router pages

## Do NOT
- Hardcode API keys or secrets
- Use `any` type
- Use `require()` — ES modules only
- Call AI providers directly — use ai-router.ts
- Push to main without PR
- Use localStorage in components (use server state)
- Write raw SQL outside migrations
