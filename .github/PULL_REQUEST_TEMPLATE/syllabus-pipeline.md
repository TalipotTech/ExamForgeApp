# PR: feat/syllabus-pipeline — Syllabus Intelligence Pipeline

## Summary

Implements the complete Syllabus Intelligence Pipeline: upload a PDF syllabus,
extract structured content via Document AI, generate comprehensive tutorials
using multi-agent AI (user-selected providers), and create MCQs/exams from
the generated tutorials.

## Type of Change

- [x] `feat:` New feature

## Related Documents

- Feature Spec: `docs/features/SYLLABUS_PIPELINE.md`
- AI Prompts: `docs/prompts/SYLLABUS_PROMPTS.md`
- Backlog: `BACKLOG.md` → Phase 1.5 section

## Implementation Plan (Sub-PRs)

This is a large feature. Break into these sub-PRs merged in order:

### Sub-PR 1: Database Schema + Validators

**Branch:** `feat/syllabus-pipeline-schema`

- [ ] Drizzle schema: `syllabi`, `syllabus_nodes`, `tutorials`, `tutorial_questions`
- [ ] Zod validators: `syllabus.ts`, `tutorial.ts`
- [ ] Migration `0002_syllabus_pipeline.sql`
- [ ] Export from `packages/shared/src/index.ts`
- [ ] Update seed script with sample syllabus data

### Sub-PR 2: PDF Processing + Extraction Worker

**Branch:** `feat/syllabus-pipeline-processor`

- [ ] S3 presigned URL upload endpoint
- [ ] BullMQ worker: `syllabus-processor.ts`
- [ ] Text extraction: pdf-parse (text PDFs) + Claude Vision (scanned)
- [ ] AI syllabus structure extraction (prompt + Instructor.js)
- [ ] Save parsed tree to `syllabus_nodes`
- [ ] Status tracking: uploading → processing → parsed → error

### Sub-PR 3: Multi-Agent AI Module

**Branch:** `feat/syllabus-pipeline-multi-agent`

- [ ] `apps/api/src/ai/multi-agent.ts`
- [ ] Fan-out to selected providers in parallel
- [ ] Merge strategies: combine, best_of, vote
- [ ] Per-provider cost tracking in `ai_usage_logs`
- [ ] Timeout + partial failure handling
- [ ] Unit tests with mocked providers

### Sub-PR 4: Tutorial + MCQ Generation Endpoints

**Branch:** `feat/syllabus-pipeline-generation`

- [ ] Tutorial generation prompt + Instructor.js schema
- [ ] MCQ from tutorial prompt + QuestionSchema validation
- [ ] tRPC router: `syllabus.generateTutorial`, `generateMCQs`
- [ ] Tutorial versioning (is_current flag)
- [ ] Exam assembly from selected nodes

### Sub-PR 5: Frontend — Upload + Tree Viewer

**Branch:** `feat/syllabus-pipeline-ui-tree`

- [ ] AI Provider Selector component (reusable)
- [ ] Syllabus upload page (drag-drop, progress, status polling)
- [ ] Syllabus tree viewer (collapsible, status badges, search)
- [ ] Node detail panel with action buttons

### Sub-PR 6: Frontend — Tutorial Viewer + MCQ Review

**Branch:** `feat/syllabus-pipeline-ui-tutorial`

- [ ] Tutorial display (rich structured content, provider attribution)
- [ ] MCQ review flow (accept/reject/edit, bulk actions)
- [ ] Exam builder from syllabus nodes
- [ ] Mobile responsive layouts

## Exam Verticals Affected

- [x] BPharm Assistant Professor (primary)
- [x] All exams (shared infrastructure — multi-agent, provider selector)

## AI Provider Impact

- [x] New AI feature (providers: Claude, Gemini, OpenAI, Mistral, Perplexity)
- [x] Modified prompts: 3 new prompt templates (extraction, tutorial, MCQ)
- [x] Cost impact: varies by user selection
  - Single provider (Claude): ~$0.05/tutorial, ~$0.02/10 MCQs
  - Multi-agent (all 5): ~$0.15/tutorial, ~$0.08/10 MCQs

## Database Changes

- [x] New migration: 4 new tables (syllabi, syllabus_nodes, tutorials, tutorial_questions)
- [x] Migration is backward-compatible (additive only)
- [x] No data backfill needed

## AWS Infrastructure

- [x] S3 bucket already provisioned (examforge-uploads)
- [ ] May need: SQS dead letter queue for failed processing jobs
- [ ] May need: increase App Runner memory for large PDF processing

## Testing Plan

- [ ] Unit: multi-agent fan-out/merge logic, tree building from flat nodes
- [ ] Integration: PDF upload → extraction → save (with test PDF)
- [ ] Integration: tutorial generation → MCQ generation → DB persistence
- [ ] E2E: upload → view tree → generate tutorial → generate MCQs → create exam
- [ ] Test with real BPharm syllabus PDF (manually verified)

## Checklist

- [ ] CLAUDE.md updated with new schema + feature status
- [ ] AGENTS.md updated with multi-agent pattern
- [ ] BACKLOG.md checkboxes updated
- [ ] docs/features/SYLLABUS_PIPELINE.md complete
- [ ] docs/prompts/SYLLABUS_PROMPTS.md complete
- [ ] .claude/rules/syllabus-pipeline.md added
- [ ] .cursor/rules/syllabus-pipeline.mdc added
- [ ] No hardcoded secrets or API keys
- [ ] TypeScript strict — no `any` types
