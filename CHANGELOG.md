# Changelog

All notable changes to ExamForge are documented here.
Format: [Conventional Changelog](https://www.conventionalcommits.org/)

---

## [Unreleased] — Syllabus Intelligence Pipeline

### Added

- `docs/features/SYLLABUS_PIPELINE.md` — Full feature specification
- `docs/prompts/SYLLABUS_PROMPTS.md` — AI prompts for extraction, tutorials, MCQs
- `.claude/rules/syllabus-pipeline.md` — Claude Code context for this feature
- `.cursor/rules/syllabus-pipeline.mdc` — Cursor context for UI development
- `.github/PULL_REQUEST_TEMPLATE/syllabus-pipeline.md` — PR template for sub-PRs
- `BACKLOG.md` — Development task tracker with checkboxes
- `CHANGELOG.md` — This file

### Changed

- `CLAUDE.md` — Added active feature section, planned schema, known fixes
- `AGENTS.md` — Added multi-agent pattern, current status, new file references

---

## [0.1.0] — 2026-03-10 — MVP Foundation

### Added

- **Monorepo Setup**: Turborepo + pnpm workspaces, ESLint, Prettier, Vitest
- **Database Schema**: 8 tables (organizations, users, exams, questions, question_versions, exam_sessions, scrape_sources, ai_usage_logs), 5 enums, pgvector
- **Migrations**: `0000_initial_schema.sql`, `0001_add_password_metadata.sql`
- **Auth**: NextAuth.js v5 with credentials provider, middleware-protected routes
- **Seed Script**: Organization, admin user, 3 exams, 5 sample questions
- **Landing Page**: Hero section, feature cards, CTA, responsive layout
- **API Server**: Fastify 5 + tRPC v11, health endpoint, CORS configured
- **Docker Compose**: Local Postgres (pgvector) + Redis
- **Configuration**: CLAUDE.md, AGENTS.md, .cursor/rules/, .claude/rules/
- **CI/CD**: GitHub Actions workflow (lint → test → build → deploy)
- **AWS CDK**: Infrastructure stack (VPC, RDS, ElastiCache, S3, ECR)
- **PR Templates**: Default + feature templates with exam/AI/AWS checklists
- **Dev Prompts**: `docs/prompts/DEVELOPMENT_PROMPTS.md` for Claude Code + Cursor

### Fixed

- 8 monorepo wiring issues (dotenv loading, pnpm hoisting, Turbopack, NextAuth Edge runtime)
- See `TASKS_COMPLETED.md` Task 2 for full list
