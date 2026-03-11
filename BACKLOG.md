# ExamForge — Development Backlog

> Track all features and tasks. Claude Code and Cursor reference this file.
> Check off items as completed. Add new items at the bottom of each section.

---

## Phase 1: MVP Foundation

### ✅ Completed

- [x] **Monorepo Setup** — Turborepo + pnpm workspaces + ESLint + Prettier + Vitest
- [x] **Database Schema** — 8 tables, 5 enums, Drizzle ORM, pgvector, 2 migrations
- [x] **Auth System** — NextAuth v5 + credentials provider + middleware protection
- [x] **Local Dev Environment** — Docker Compose (Postgres+pgvector, Redis), dotenv fixes
- [x] **Seed Script** — Org, admin user, 3 exams, 5 sample questions
- [x] **Landing Page** — Hero, features grid, CTA, responsive
- [x] **API Server** — Fastify 5 + tRPC v11, health endpoint, CORS
- [x] **Environment Fixes** — 8 monorepo wiring issues resolved (see TASKS_COMPLETED.md)

### 🔲 In Progress

- [ ] **Syllabus Intelligence Pipeline** ← ACTIVE FEATURE (see below)

### 🔲 Queued (MVP)

- [ ] **Question Bank UI** — Server Component, filtering, search, expandable cards, pagination
- [ ] **Exam-Taking Interface** — Timer, navigation, keyboard shortcuts, auto-save, results
- [ ] **AI Question Generator UI** — Provider selector, streaming, accept/reject, cost display
- [ ] **AI Router** — Central provider routing, cache, retry, fallback, cost tracking
- [ ] **Dashboard Layout** — Sidebar nav, top bar, breadcrumbs, mobile responsive
- [ ] **User Profile & Settings** — Account info, password change, notification prefs

---

## Phase 1.5: Syllabus Intelligence Pipeline ← ACTIVE

> Full spec: `docs/features/SYLLABUS_PIPELINE.md`
> AI Prompts: `docs/prompts/SYLLABUS_PROMPTS.md`

### Database (Schema + Migration)

- [ ] Create `syllabi` table — metadata, exam FK, status, S3 file path
- [ ] Create `syllabus_nodes` table — tree structure with self-referencing parent_id
- [ ] Create `tutorials` table — generated content per node, provider tracking
- [ ] Create `tutorial_questions` table — MCQs generated from tutorial content
- [ ] Add Zod validators for all new tables
- [ ] Generate migration `0002_syllabus_pipeline.sql`
- [ ] Update seed script with sample syllabus data

### Backend — PDF Processing

- [ ] Install pdf-parse + @azure/ai-form-recognizer (or Unstructured.io)
- [ ] Create `apps/api/src/workers/syllabus-processor.ts` BullMQ worker
- [ ] S3 upload endpoint for PDFs (presigned URL pattern)
- [ ] PDF text extraction (pdf-parse for text PDFs)
- [ ] AI-powered extraction for scanned/complex PDFs (Claude Vision + Gemini)
- [ ] Structured syllabus tree parser (LLM → SyllabusNodeSchema[])
- [ ] Save parsed tree to `syllabus_nodes` table
- [ ] Status tracking: uploading → processing → parsed → error

### Backend — Multi-Agent Tutorial Generation

- [ ] Create `apps/api/src/ai/multi-agent.ts` — fan-out/merge pattern
- [ ] Create `apps/api/src/ai/prompts/tutorial-generation.ts`
- [ ] tRPC router: `syllabus.generateTutorial` mutation
- [ ] Single-provider mode: route to user's selected provider
- [ ] Multi-agent mode: fan-out to all selected, merge results
- [ ] Content merging strategy: deduplicate, rank by quality, combine
- [ ] Save tutorial to DB with provider attribution
- [ ] Tutorial versioning (re-generate preserves old version)

### Backend — MCQ Generation from Tutorials

- [ ] Create `apps/api/src/ai/prompts/tutorial-to-mcq.ts`
- [ ] tRPC router: `syllabus.generateMCQs` mutation
- [ ] Generate MCQs from tutorial content (not just topic name)
- [ ] Validate all MCQs via Instructor.js + QuestionSchema
- [ ] Save to `tutorial_questions` + link to `questions` table
- [ ] Difficulty distribution: 30% easy, 50% medium, 20% hard

### Backend — Exam Assembly from Syllabus

- [ ] tRPC router: `syllabus.createExam` mutation
- [ ] Select nodes → pull questions from tutorial_questions → assemble exam
- [ ] Configurable: question count, difficulty mix, time limit
- [ ] Create exam_session and return session ID

### Frontend — Syllabus Upload & Viewer

- [ ] Upload page: drag-and-drop PDF, progress bar, status indicator
- [ ] Syllabus tree viewer: collapsible tree with unit/topic/subtopic nodes
- [ ] Node detail panel: show parsed content, definitions, key terms
- [ ] Status badges: parsed, tutorial generated, MCQs available

### Frontend — AI Provider Selector

- [ ] Provider selection component (reusable across all AI features)
- [ ] Options: Claude, Gemini, OpenAI, Mistral, Perplexity + "Use All"
- [ ] Show per-provider: model name, estimated cost, strengths
- [ ] Persist user's last selection in localStorage/server
- [ ] Multi-select mode with "merge results" explanation

### Frontend — Tutorial Viewer & MCQ Generation

- [ ] Tutorial display: rich text with headings, definitions, examples, diagrams
- [ ] "Generate Tutorial" button per syllabus node
- [ ] Provider selector inline (which AI to use for this tutorial)
- [ ] "Generate MCQs" button on tutorial page
- [ ] MCQ preview: review, edit, accept/reject individual questions
- [ ] "Create Exam from Topic" quick action

### Frontend — Exam from Syllabus

- [ ] Syllabus-based exam builder: select nodes → configure → generate
- [ ] Progress indicator: how many topics have tutorials + MCQs
- [ ] "Generate All" bulk action for entire syllabus

---

## Phase 2: Multi-Exam Expansion

- [ ] Add NEET UG exam vertical (seed data + prompts)
- [ ] Add GPAT exam vertical
- [ ] Add Kerala PSC exam vertical
- [ ] Web scraping pipeline (Crawlee + BullMQ + ai-router)
- [ ] RAG answer verification (pgvector + LlamaIndex)
- [ ] Multilingual support — Hindi question generation
- [ ] React Native (Expo) mobile app
- [ ] User analytics dashboard (study time, weak topics, progress)

---

## Phase 3: Platform Scale

- [ ] Multi-tenant coaching institute white-labeling
- [ ] Adaptive difficulty engine (IRT model)
- [ ] Migrate App Runner → ECS Fargate
- [ ] Video lecture → questions pipeline (Gemini)
- [ ] Voice-to-question (Whisper)
- [ ] Payment integration (Razorpay subscriptions)
- [ ] SOC 2 / DPDPA compliance audit

---

## Infrastructure & DevOps

- [ ] AWS CDK deploy working (App Runner + RDS + ElastiCache + S3)
- [ ] GitHub Actions CI/CD pipeline
- [ ] Staging environment on AWS
- [ ] CloudFront CDN for static assets
- [ ] Sentry error tracking
- [ ] PostHog analytics (self-hosted)
- [ ] CloudWatch alarms + SNS alerts

---

_Last updated: March 2026_
_Use `@BACKLOG.md` in Claude Code or Cursor to reference this file._
