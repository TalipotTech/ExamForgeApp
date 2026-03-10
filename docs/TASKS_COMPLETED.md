# ExamForge — Completed Tasks

---

## Task 1: Database Schema Initialization

**Date:** 2026-03-10
**Scope:** Drizzle ORM schema creation, migration generation, local SQL debug script

### Tables Created (8)

| # | Table | File | Columns | Key Features |
|---|-------|------|---------|--------------|
| 1 | `organizations` | `organizations.ts` | 8 | Root entity, JSONB settings, unique slug |
| 2 | `users` | `users.ts` | 10 | pgEnum roles (student/teacher/admin/superadmin), unique email + phone, password_hash, FK to organizations |
| 3 | `exams` | `exams.ts` | 9 | JSONB subjects array, JSONB metadata, FK to organizations |
| 4 | `questions` | `questions.ts` | 14 | pgEnum type (mcq/true_false/fill_blank/match/assertion), pgEnum difficulty, JSONB content (discriminated union), pgvector embedding (1536 dims), JSONB translations (hi/ta/ml), 3 indexes |
| 5 | `question_versions` | `question-versions.ts` | 7 | Audit trail for question edits, pgEnum change_type, cascade delete from questions, indexed on question_id |
| 6 | `exam_sessions` | `exam-sessions.ts` | 14 | JSONB questions/answers, score tracking, time tracking, JSONB metadata, FK to users/exams/organizations |
| 7 | `scrape_sources` | `scrape-sources.ts` | 11 | pgEnum scrape_status, JSONB config, FK to exams/organizations |
| 8 | `ai_usage_logs` | `ai-usage-logs.ts` | 12 | Token/cost/latency tracking per AI call, FK to users/exams |

### Enums (5)

| Enum | Values |
|------|--------|
| `user_role` | student, teacher, admin, superadmin |
| `difficulty` | easy, medium, hard |
| `question_type` | mcq, true_false, fill_blank, match, assertion |
| `scrape_status` | pending, active, paused, error, completed |
| `change_type` | created, updated, reviewed, translated, archived |

### Migrations

| Migration | File | Changes |
|-----------|------|---------|
| 0000 | `0000_lush_human_fly.sql` | Initial schema — all 8 tables, 5 enums, 13 FKs, 4 indexes |
| 0001 | `0001_perpetual_stepford_cuckoos.sql` | Added `password_hash` to users, `metadata` to exam_sessions |

---

## Task 2: Local Development Setup & Environment Fixes

**Date:** 2026-03-10
**Scope:** Environment variable loading, dependency resolution, monorepo wiring

### Problems Fixed

| # | Problem | Root Cause | Fix |
|---|---------|-----------|-----|
| 1 | `drizzle-kit migrate` — `url: undefined` | `.env.local` at monorepo root not loaded by drizzle-kit | Added `dotenv` to `packages/shared/drizzle.config.ts` to load `../../.env.local` |
| 2 | API server — `DATABASE_URL environment variable is required` | `apps/api` tsx dev server doesn't auto-load root `.env.local` | Added `dotenv` import to `apps/api/src/index.ts` loading `../../.env.local` |
| 3 | Web — `Can't resolve 'drizzle-orm'` | pnpm strict hoisting; `auth.ts` imports `drizzle-orm` directly but it wasn't in `apps/web` deps | Added `drizzle-orm`, `pg`, `@types/pg` as direct dependencies of `apps/web` |
| 4 | Web — `Package pg can't be external` | Next.js Turbopack couldn't handle `pg` as server-only package | Added `serverExternalPackages: ["pg", "pg-pool"]` to `next.config.ts` |
| 5 | Web — `MissingSecret` for NextAuth | Next.js didn't load root `.env.local` for the web app | Added `dotenv` to `apps/web/next.config.ts` loading `../../.env.local` |
| 6 | Web — `MissingSecret` in middleware `getToken` | Edge runtime bundler doesn't statically replace `process.env` in `node_modules` (`next-auth/jwt`) | Passed `secret` explicitly to `getToken({ req, secret: process.env.AUTH_SECRET })` |
| 7 | Web — `Can't resolve './question.js'` in validators | Turbopack `transpilePackages` doesn't resolve `.js` → `.ts` in workspace packages | Removed `.js` extensions from all imports in `packages/shared/src/` |
| 8 | Web — `Can't resolve 'zod'` | pnpm strict hoisting; `zod` not in `apps/web` deps | Added `zod` as direct dependency of `apps/web` |

### Dependencies Added

| Package | Added To | Reason |
|---------|----------|--------|
| `dotenv` | `@examforge/shared` (dev), `@examforge/api`, `@examforge/web` | Load root `.env.local` in monorepo sub-packages |
| `drizzle-orm` | `@examforge/web` | Direct import in `auth.ts` |
| `pg`, `@types/pg` | `@examforge/web` | Required by drizzle-orm node-postgres driver |
| `zod` | `@examforge/web` | Used by `@examforge/shared/validators` |
| `bcryptjs`, `@types/bcryptjs` | `@examforge/shared` | Password hashing in seed script |
| `tsx` | `@examforge/shared` (dev), root (dev) | Run TypeScript scripts directly |

### Config Changes

| File | Change |
|------|--------|
| `apps/web/next.config.ts` | Added `dotenv` loading + `serverExternalPackages: ["pg", "pg-pool"]` |
| `apps/web/src/middleware.ts` | Pass `secret` explicitly to `getToken()` |
| `apps/api/src/index.ts` | Added `dotenv` import at top to load root `.env.local` |
| `packages/shared/drizzle.config.ts` | Added `dotenv` import to load root `.env.local` |
| `packages/shared/src/index.ts` | Removed `.js` extensions from imports |
| `packages/shared/src/validators/index.ts` | Removed `.js` extensions from imports |
| `packages/shared/src/validators/ai-generate.ts` | Removed `.js` extension from import |
| `turbo.json` | Added `db:seed` task |

---

## Task 3: Database Seed Script

**Date:** 2026-03-10
**Scope:** TypeScript seed script for local development data

### Created

| File | Purpose |
|------|---------|
| `packages/shared/scripts/seed.ts` | Seeds dev database with org, admin user, exams, and sample questions |
| `packages/shared/package.json` | Added `db:seed` script |
| Root `package.json` | Added `pnpm db:seed` command (runs via Turborepo) |

### Seed Data

| Entity | Count | Details |
|--------|-------|---------|
| Organization | 1 | ExamForge Dev Org (enterprise plan) |
| User | 1 | `admin@examforge.dev` / `password123` (superadmin) |
| Exams | 3 | BPharm Asst Prof 2025, GPAT 2025, NEET 2025 |
| Questions | 5 | MCQs across Pharmaceutics, Pharmacology, Pharmacognosy |

**Run with:** `pnpm db:seed`

---

## Task 4: Landing Page

**Date:** 2026-03-10
**Scope:** Replace placeholder homepage with a full landing page

### Updated

| File | Change |
|------|--------|
| `apps/web/src/app/page.tsx` | Full landing page with hero, features, CTA, and footer |

### Sections

- **Header** — Sticky nav with ExamForge branding + Sign in button
- **Hero** — Gradient title, description, CTA button, exam badges (BPharm, GPAT, NEET, UPSC, Kerala PSC, GATE)
- **Features** — 6 cards: AI Question Generation, Question Bank, Mock Exams, Analytics, Instant Explanations, Multi-Language
- **CTA** — Bottom call-to-action with "Get Started Free" button
- **Footer** — Minimal branding footer

Uses existing shadcn/ui components: `Button`, `Badge`, `Card`, `CardContent` + Lucide icons.

---

## How to Run

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL, REDIS_URL, API keys

# 3. Run migrations
pnpm db:migrate

# 4. Seed the database
pnpm db:seed

# 5. Start dev servers (web :3000, api :4000)
pnpm dev
```

**Dev login:** `admin@examforge.dev` / `password123`
