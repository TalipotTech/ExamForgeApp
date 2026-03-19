# ExamForge — Complete Technical Documentation

> AI-powered exam preparation platform for Indian competitive exams
> Generated: 2026-03-19

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Database Schema](#4-database-schema)
5. [Application Structure](#5-application-structure)
6. [Feature Status](#6-feature-status)
7. [AI Integration](#7-ai-integration)
8. [Infrastructure](#8-infrastructure)
9. [TODOs & Roadmap](#9-todos--roadmap)

---

## 1. Project Overview

ExamForge is a vertical AI platform for exam preparation in India. Primary target: BPharm Assistant Professor exam. Expanding to NEET, GPAT, UPSC, State PSCs, GATE.

**Core value proposition**: PDF syllabus upload → AI-extracted tree structure → multi-agent tutorial generation → auto-generated MCQs → practice exams — all powered by 5+ AI providers.

**Business model**: Freemium with 50 free credits/month, paid plans (Pro/Premium) via Razorpay.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Monorepo (Turborepo + pnpm)          │
├──────────────┬──────────────┬────────────┬──────────────┤
│  apps/web    │  apps/api    │ packages/  │   infra/     │
│  Next.js 15  │  Fastify 5   │  shared    │  AWS CDK     │
│  App Router  │  tRPC v11    │  Types     │  TypeScript  │
│  React 19    │  BullMQ      │  Validators│              │
│  Tailwind v4 │  Drizzle ORM │  Constants │              │
│  shadcn/ui   │  AI Router   │  DB Schema │              │
└──────┬───────┴──────┬───────┴─────┬──────┴──────┬───────┘
       │              │             │             │
       ▼              ▼             ▼             ▼
   CloudFront     App Runner    RDS Postgres   ElastiCache
   (CDN + S3)     (Container)   17 + pgvector  Redis 7
```

**Data flow**: Client → Next.js API routes → tRPC → Fastify → PostgreSQL/Redis
**Background jobs**: BullMQ workers → Redis queue → AI providers → DB

---

## 3. Tech Stack

| Layer           | Technology            | Version      |
| --------------- | --------------------- | ------------ |
| Runtime         | Node.js               | 22 LTS       |
| Language        | TypeScript            | 5.7 (strict) |
| Package Manager | pnpm                  | 9.15         |
| Monorepo        | Turborepo             | 2.3.0        |
| Frontend        | Next.js (App Router)  | 15           |
| UI              | React                 | 19           |
| Styling         | Tailwind CSS          | v4           |
| Components      | shadcn/ui             | latest       |
| Client State    | Zustand               | latest       |
| Server State    | TanStack Query        | v5           |
| Backend         | Fastify               | 5            |
| API Layer       | tRPC                  | v11          |
| ORM             | Drizzle ORM           | latest       |
| Database        | PostgreSQL + pgvector | 17           |
| Cache/Queue     | Redis (ElastiCache)   | 7            |
| Job Queue       | BullMQ                | 5            |
| Auth            | NextAuth.js           | v5 (beta)    |
| AI SDK          | Vercel AI SDK         | 6.0          |
| AI Validation   | Instructor.js + Zod   | latest       |
| Payments        | Razorpay              | latest       |
| Scraping        | Crawlee + Playwright  | latest       |
| Email           | Resend + Nodemailer   | latest       |
| SMS             | MSG91                 | latest       |
| IaC             | AWS CDK               | TypeScript   |
| CI/CD           | GitHub Actions        | latest       |

**AI Providers**: Anthropic (Claude), OpenAI (GPT-4o), Google (Gemini), Mistral, Perplexity

---

## 4. Database Schema

**37 tables** across 8 domains. ORM: Drizzle. All tables have `id`, `created_at`, `updated_at`.

### 4.1 Entity Relationship Diagram

```
organizations (root)
  ├── users ──────────────────┬── auth_sessions
  │     ├── exam_sessions     │── otp_verifications
  │     ├── user_exams        │── user_subscriptions
  │     ├── user_credits      │── user_progress
  │     ├── user_saved_content│── topic_conversations
  │     ├── topic_notes       │── tutorial_progress
  │     ├── user_generated_exams
  │     ├── payment_orders
  │     └── content_searches ── search_results
  │
  ├── exams
  │     ├── questions ────────── question_versions
  │     │     └── (embedding: vector 1536)
  │     ├── exam_sessions
  │     ├── exam_notifications
  │     ├── scrape_sources ──── scrape_runs
  │     ├── syllabi
  │     │     └── syllabus_nodes (self-ref tree)
  │     │           ├── tutorials ── tutorial_questions
  │     │           ├── tutorial_files
  │     │           ├── topic_notes
  │     │           └── topic_note_summaries
  │     ├── portal_documents ── staged_questions
  │     └── tutorial_generation_jobs
  │
  ├── subscription_plans ──── user_subscriptions
  ├── discovery_runs
  ├── admin_feature_flags
  └── admin_audit_log
```

### 4.2 Table Details by Domain

#### Auth & Users (4 tables)

**organizations**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | varchar(255) | |
| slug | varchar(100) | UNIQUE |
| plan | varchar(50) | DEFAULT 'free' |
| isActive | boolean | DEFAULT true |
| settings | JSONB | |

**users**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| email | varchar(255) | UNIQUE |
| name | varchar(255) | |
| username | varchar(50) | UNIQUE |
| phone | varchar(20) | UNIQUE |
| passwordHash | varchar(255) | |
| role | enum | student, teacher, admin, superadmin |
| orgId | UUID | FK → organizations |
| authProvider | varchar(20) | DEFAULT 'credentials' |
| googleId | varchar(100) | UNIQUE |
| onboardingCompleted | boolean | |
| pinHash | varchar(255) | |
| loginCount | integer | |
| metadata | JSONB | |

**auth_sessions** — Session tokens with device info, expiry
**otp_verifications** — SMS/email OTP with attempt tracking, expiry

#### Exam System (4 tables)

**exams**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | varchar(255) | |
| category | varchar(100) | |
| subjects | JSONB (string[]) | |
| status | varchar(20) | DEFAULT 'active' |
| examDate, registrationStart/End, resultDate | timestamp | |
| officialUrl, applicationUrl, syllabusUrl | varchar | |
| conductingBody | varchar(255) | |
| totalMarks, durationMinutes | integer | |
| negativeMarking | boolean | |
| examPattern | JSONB | |
| isFeatured, isAutoDiscovered | boolean | |
| popularityScore | integer | |

**exam_sessions** — User exam attempts: questions (JSONB), answers, score, timing
**exam_notifications** — Date/status change alerts per exam
**user_exams** — User ↔ exam association with target score and priority

#### Questions (3 tables)

**questions**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| examId | UUID | FK → exams |
| type | enum | mcq, true_false, fill_blank, match, assertion |
| content | JSONB | Discriminated union by type |
| subject, topic | varchar | |
| difficulty | enum | easy, medium, hard |
| translations | JSONB | {hi, ta, ml} with question/options/explanation |
| embedding | vector(1536) | pgvector for semantic search |
| portalDocumentId | UUID | FK → portal_documents |
| paperYear, questionNumber | integer | |

**question_versions** — Edit history: content snapshots + change type
**staged_questions** — Review workflow for scraped questions: pending → approved/rejected

#### Syllabus & Learning (8 tables)

**syllabi** — PDF syllabus metadata: fileKey (S3), status (uploading→processing→ready), rawText, pageCount
**syllabus_nodes** — Tree structure (adjacency list):

| Column              | Type         | Notes                          |
| ------------------- | ------------ | ------------------------------ |
| id                  | bigserial    | PK                             |
| syllabusId          | bigint       | FK → syllabi                   |
| parentId            | bigint       | Self-ref FK (CASCADE DELETE)   |
| nodeType            | varchar(20)  | unit, chapter, topic, subtopic |
| title               | varchar(500) |                                |
| depth               | integer      | 0-4                            |
| sortOrder           | integer      |                                |
| tutorialStatus      | varchar(20)  | none, generating, ready        |
| mcqStatus, mcqCount |              |                                |

**tutorials** — Rich content (JSONB + plain text), versioned, multi-provider attribution
**tutorial_files** — Generated HTML files stored in S3, with sections metadata, free preview support
**tutorial_questions** — Junction: tutorial ↔ question ↔ syllabus_node
**tutorial_progress** — Per-user completion: sections read, percentage, read time
**tutorial_generation_jobs** — Batch generation tracking: total/completed/failed nodes, cost

**topic_conversations** — Chat history per topic (messages JSONB array)
**topic_notes** — User notes linked to syllabus nodes
**topic_note_summaries** — AI-generated summaries per node

#### Content Discovery (4 tables)

**content_searches** — User queries with parsed query (JSONB), cache key
**search_results** — Ranked results: title, URL, content type, relevance score
**portal_documents** — Ingested portal PDFs: processing status, extracted text, question count
**user_saved_content** — Bookmarks, downloaded PDFs, extracted text/questions

#### Scraping & Discovery (3 tables)

**scrape_sources** — Configured sources: URL, status, frequency, AI provider, run stats
**scrape_runs** — Execution history: pages visited, questions found/new/duplicate, cost
**discovery_runs** — Auto-discovery jobs: portals checked, exams found/updated

#### Payments & Subscriptions (4 tables)

**subscription_plans** — Plan definitions: name, prices (monthly/yearly INR), credit limits, features (JSONB)
**user_subscriptions** — Active subscription: plan, billing cycle, period, Razorpay ID
**user_credits** — Monthly credit allocation: total, used, questions attempted, tutorials accessed
**payment_orders** — Razorpay orders: amount, status, payment/signature IDs

#### Admin & Progress (4 tables)

**admin_feature_flags** — Key-value feature toggles with category
**admin_audit_log** — Admin action trail: action, target, before/after JSONB
**user_progress** — Exam progress: total attempted/correct, streak, subject scores (JSONB), weak/strong subjects
**user_generated_exams** — User-created practice exams from tutorials: questions JSONB, scoring

### 4.3 Key Database Patterns

- **Multi-tenancy**: `org_id` FK on all user-data tables, filtered in every query
- **Tree structure**: `syllabus_nodes` uses adjacency list (parentId self-reference + depth + sortOrder)
- **Discriminated unions**: `questions.content` JSONB varies by `type` enum
- **Versioning**: tutorials and tutorial_files use `version` + `is_current` flag
- **Vector search**: `questions.embedding` with HNSW index for semantic similarity
- **JSONB flexibility**: translations, exam patterns, settings, chat messages
- **Audit trail**: `question_versions` and `admin_audit_log` for change tracking

---

## 5. Application Structure

### 5.1 Frontend (apps/web)

#### Routes (55+ pages)

**Public**
| Route | Purpose |
|-------|---------|
| `/` | Landing page with hero, features, stats |
| `/exams` | Public exam catalog (SEO-optimized) |
| `/exams/[id]` | Exam detail page |
| `/pricing` | Subscription plan comparison |
| `/examinations` | Portal document showcase |
| `/onboarding` | Post-signup exam selection |

**Auth** (`/(auth)/`)
| Route | Purpose |
|-------|---------|
| `/login` | Email/phone + password/OTP login |
| `/signup` | Registration |
| `/verify` | OTP verification |
| `/forgot-password` | Password recovery |

**Dashboard** (`/(dashboard)/`)
| Route | Purpose |
|-------|---------|
| `/dashboard` | Main dashboard with stats |
| `/dashboard/my-exams` | User's selected exams + progress |
| `/dashboard/my-exams/results/[examId]` | Past exam results |
| `/dashboard/profile` | Profile management |
| `/dashboard/settings` | User settings |
| `/dashboard/topics` | Topic browser |
| `/dashboard/notes` | Study notes |
| `/dashboard/notes/details` | Note detail view |
| `/dashboard/find` | Content Finder search |
| `/dashboard/saved` | Saved/bookmarked content |
| `/dashboard/questions` | Question library |
| `/dashboard/generate` | AI question generation |
| `/syllabus` | Syllabus list |
| `/syllabus/[id]` | Syllabus tree view |
| `/syllabus/[id]/tutorial/[nodeId]` | Tutorial for a topic |
| `/syllabus/[id]/exam` | Generate exam from syllabus |
| `/syllabus/upload` | Upload PDF syllabus |
| `/results/[sessionId]` | Exam session results |

**Learning** (`/(dashboard)/learn/`)
| Route | Purpose |
|-------|---------|
| `/learn` | Learning hub |
| `/learn/[syllabusId]` | Full learning interface with sidebar, content, chat, notes, progress |

**Exam Interface** (`/(exam)/`)
| Route | Purpose |
|-------|---------|
| `/practice/[examId]` | Practice exam setup |
| `/practice/[examId]/results` | Results with explanations |
| `/take/[sessionId]` | Live exam taking (timer, navigation) |

**Admin** (`/(dashboard)/admin/`)
| Route | Purpose |
|-------|---------|
| `/admin` | Admin dashboard |
| `/admin/settings` | Platform settings + feature flags |
| `/admin/tutorials` | Tutorial management |
| `/admin/users` | User management |
| `/admin/users/[id]` | User detail |

**Scraper** (`/(dashboard)/scraper/`)
| Route | Purpose |
|-------|---------|
| `/scraper` | Scraper overview |
| `/scraper/add` | Add scrape source |
| `/scraper/discovery` | Exam discovery agent |
| `/scraper/ingest` | Portal document ingestion |
| `/scraper/ingest/[documentId]` | Process specific document |
| `/scrape` | Question scraping interface |

**Public Topics**
| Route | Purpose |
|-------|---------|
| `/topics/[examSlug]` | Public topic listing per exam |
| `/topics/[examSlug]/[topicSlug]` | Public topic content |

#### Key Components

| Category    | Components                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI (shadcn) | badge, button, card, dialog, dropdown, input, select, tabs, table, skeleton, sonner (18+)                                                          |
| Exam        | exam-timer, exam-results, question-display, question-nav, submit-modal                                                                             |
| Generation  | generate-form, question-generator, cost-summary, generation-progress, results-preview                                                              |
| Home        | exam-showcase, examination-list, popular-tags, site-stats, topic-explorer                                                                          |
| Learning    | learn-content, learn-sidebar, learn-navigation, learn-search, learn-chat, learn-notes, learn-progress-bar, generate-exam-dialog, selection-tooltip |
| Scraper     | add-source-dialog, delete-source-dialog, scrape-progress, source-list                                                                              |
| Shared      | ai-provider-selector, markdown-message, subscriber-gate, upgrade-plan-banner, verification-banner                                                  |

#### Client Libraries

- `lib/trpc.ts` — tRPC client setup
- `lib/auth.ts` — Auth utilities
- `lib/utils.ts` — General utilities
- `hooks/use-debounce.ts` — Debounce hook
- `middleware.ts` — Auth/routing middleware

### 5.2 Backend (apps/api)

#### tRPC Routers (17)

| Router             | Key Procedures                                        |
| ------------------ | ----------------------------------------------------- |
| `health`           | Health check                                          |
| `auth`             | login, signup, verifyOtp, setPin, verifyPin           |
| `exam`             | list, getById, create, update, featured, upcoming     |
| `exam-session`     | start, saveAnswer, submit, getResults                 |
| `question`         | list, getById, create, bulkCreate, search             |
| `scrape`           | startScrape, testScrape, getStatus                    |
| `scrape-source`    | list, create, update, delete, testRun                 |
| `syllabus`         | upload, getTree, process, getById                     |
| `content-finder`   | search, preview, extract, save, getSaved              |
| `portal-ingestion` | listDocuments, process, getDocument                   |
| `tutorial-agent`   | generate, getStatus, getBySyllabusNode                |
| `learn`            | getProgress, updateProgress, chat, saveNote, getNotes |
| `payment`          | createOrder, verifyPayment, getPlans, getSubscription |
| `admin-users`      | list, getById, ban, unban, impersonate                |
| `admin-settings`   | getFlags, updateFlag, getAuditLog                     |
| `public-content`   | getTopics, getTopicContent, getExamTopics             |
| `onboarding`       | getExams, selectExams, completeOnboarding             |

#### Services (13)

| Service                      | Purpose                            |
| ---------------------------- | ---------------------------------- |
| `audit-log.ts`               | Admin action logging               |
| `content-search-engine.ts`   | Multi-strategy search with ranking |
| `email-service.ts`           | Transactional emails               |
| `feature-flags.ts`           | Feature toggle management          |
| `kerala-psc-parser.ts`       | Exam-specific content parser       |
| `otp-service.ts`             | OTP generation/verification        |
| `payment-service.ts`         | Razorpay integration               |
| `pdf-processor.ts`           | PDF text extraction                |
| `portal-crawler.ts`          | Web scraping engine                |
| `sms-service.ts`             | MSG91 SMS integration              |
| `subscription-guard.ts`      | Quota/credit enforcement           |
| `tutorial-html-generator.ts` | Tutorial → HTML conversion         |
| `tutorial-storage.ts`        | S3 tutorial file management        |

#### BullMQ Workers (10)

| Worker                     | Queue Name          | Purpose                          |
| -------------------------- | ------------------- | -------------------------------- |
| `scraper-worker`           | scrape-questions    | Extract MCQs from sources        |
| `discovery-agent`          | discover-exams      | Monitor portals for new exams    |
| `syllabus-processor`       | syllabus-process    | PDF → tree extraction            |
| `tutorial-agent-worker`    | tutorial-generation | Multi-agent tutorial creation    |
| `content-fetch-worker`     | content-fetch       | Preview/download/extract content |
| `note-summary-worker`      | note-summary        | AI-summarize user notes          |
| `portal-ingestion-worker`  | portal-ingestion    | Crawl exam portals               |
| `portal-processing-worker` | portal-processing   | Process ingested documents       |

#### AI Prompts (9)

| Prompt                    | Used For                                |
| ------------------------- | --------------------------------------- |
| `exam-discovery.ts`       | Discovering exams from portal pages     |
| `portal-extraction.ts`    | Extracting structured data from portals |
| `query-parser.ts`         | Parsing natural language search queries |
| `question-extraction.ts`  | Extracting MCQs from content            |
| `source-analysis.ts`      | Analyzing scrape source quality         |
| `syllabus-extraction.ts`  | PDF syllabus → tree structure           |
| `tutorial-generation.ts`  | Generating tutorial content             |
| `tutorial-html-prompt.ts` | Converting content to structured HTML   |
| `tutorial-to-mcq.ts`      | Generating MCQs from tutorial text      |

### 5.3 Shared Package (packages/shared)

#### Validators (17 modules)

`question`, `exam`, `ai-generate`, `scrape`, `scrape-source`, `exam-listing`, `syllabus`, `tutorial`, `tutorial-agent`, `content-finder`, `portal-ingestion`, `learn`, `auth`, `onboarding` + index

#### Constants

- AI model IDs and costs per provider
- Exam categories and languages
- Portal URLs and selectors
- Environment variable keys

#### Types

- API response types (`{ success: true, data } | { success: false, error }`)
- Provider types, category types
- Tutorial content interfaces

---

## 6. Feature Status

### Completed (Production Ready)

| Feature              | Description                                                     |
| -------------------- | --------------------------------------------------------------- |
| Authentication       | NextAuth v5 + email/password + Google OAuth + MSG91 OTP + PIN   |
| User Onboarding      | Exam selection, profile setup                                   |
| Exam Catalog         | Public listing, filtering, search, SEO metadata                 |
| Question Bank        | CRUD, 5 question types, versioning, translations                |
| Practice Exams       | Timer, question navigation, submit, results with explanations   |
| Syllabus Pipeline    | PDF upload → AI extraction → tree view → tutorial generation    |
| Tutorial System      | Multi-agent generation, HTML rendering, versioning, S3 storage  |
| Learning Platform    | Tutorials, progress tracking, AI chat, notes, text selection    |
| User-Generated Exams | Create practice exams from syllabus nodes/tutorials             |
| Portal Ingestion     | Crawl exam portals, extract documents, parse questions          |
| Admin Panel          | User management, settings, feature flags, audit log             |
| Subscription System  | Plans, Razorpay integration, credit tracking                    |
| AI Integration       | 5-provider router, cost tracking, caching, retry, rate limiting |
| Infrastructure       | AWS CDK (VPC, RDS, ElastiCache, S3, CloudFront, App Runner)     |
| Deployment           | Health checks, migrations, SSL, CORS configuration              |

### In Progress

| Feature              | Status                | Notes                                            |
| -------------------- | --------------------- | ------------------------------------------------ |
| Content Finder       | Router + UI done      | Question extraction from results pending         |
| Exam Discovery Agent | Worker + prompts done | Schedule config, portal monitoring logic pending |
| Question Scraper     | Worker + UI done      | PDF extraction, semantic dedup pending           |
| Credit Deductions    | Schema done           | Hooks into AI calls pending                      |
| Razorpay Webhooks    | Route exists          | Full verification flow pending                   |

### Not Started (Post-MVP)

| Feature                | Notes                          |
| ---------------------- | ------------------------------ |
| Content Marketplace    | User-created content sharing   |
| Audio/Video Processing | Upload + transcription         |
| Mobile App             | Expo/React Native              |
| ECS Fargate Migration  | Replace App Runner             |
| Python AI Microservice | For ML-heavy tasks             |
| Aurora Serverless v2   | Evaluate for cost optimization |

---

## 7. AI Integration

### Provider Selection Matrix

| Use Case                      | Provider                              | Model                              |
| ----------------------------- | ------------------------------------- | ---------------------------------- |
| Question generation (quality) | Claude                                | claude-sonnet-4-20250514           |
| Question generation (bulk)    | Mistral                               | mistral-large                      |
| Video/long-doc processing     | Gemini                                | gemini-2.0-flash                   |
| Web search (current affairs)  | Perplexity                            | sonar-pro                          |
| Structured output (MCQ JSON)  | OpenAI                                | gpt-4o                             |
| Embeddings                    | OpenAI                                | text-embedding-3-small (1536 dims) |
| Syllabus extraction           | Claude (primary), Gemini (large docs) |                                    |
| Tutorial generation           | User-selected (any/all)               |                                    |
| Search query parsing          | Mistral (cheapest)                    |                                    |

### Architecture

```
Feature Code
    │
    ▼
ai-router.ts (single provider)  OR  multi-agent.ts (multiple providers)
    │                                    │
    ▼                                    ▼
providers.ts ──► Anthropic SDK      Promise.allSettled([provider1, provider2, ...])
                 OpenAI SDK              │
                 Google SDK              ▼
                 Mistral SDK         mergeResults(strategy: combine | best_of | vote)
                 Perplexity              │
                                         ▼
                                    Instructor.js + Zod validation
                                         │
                                         ▼
                                    ai_usage_logs (cost tracking)
```

### Key Utilities

| Utility           | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `budget.ts`       | Token budget management per request           |
| `cache.ts`        | Redis caching for identical prompts (24h TTL) |
| `cost.ts`         | Cost calculation per provider/model           |
| `logger.ts`       | Structured logging of all AI calls            |
| `rate-limiter.ts` | Per-user rate limiting                        |
| `retry.ts`        | Exponential backoff (max 3 retries)           |

---

## 8. Infrastructure

### AWS Resources (Region: ap-south-1 Mumbai)

```
┌─────────────────── VPC ───────────────────┐
│                                           │
│  ┌──────────┐   ┌──────────┐             │
│  │App Runner│   │  RDS     │             │
│  │(Fastify) │──▶│PostgreSQL│             │
│  │          │   │17+pgvec  │             │
│  └────┬─────┘   └──────────┘             │
│       │                                   │
│       │         ┌──────────┐             │
│       └────────▶│ElastiCache│            │
│                 │ Redis 7  │             │
│                 └──────────┘             │
└───────────────────────────────────────────┘

┌──────────┐    ┌──────────┐
│CloudFront│───▶│   S3     │  (PDFs, tutorials, assets)
│  (CDN)   │    │          │
└──────────┘    └──────────┘

┌──────────────┐
│   Secrets    │  (API keys, DB credentials)
│   Manager    │
└──────────────┘
```

### Environments

| Env     | Purpose                            |
| ------- | ---------------------------------- |
| dev     | Local development (Docker Compose) |
| staging | Pre-production testing             |
| prod    | Production deployment              |

### Environment Variables (85)

| Category         | Examples                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| App              | NODE_ENV, APP_URL, API_URL                                                                                               |
| Database         | DATABASE_URL, REDIS_URL                                                                                                  |
| Auth             | NEXTAUTH_SECRET, Google OAuth IDs, MSG91 keys                                                                            |
| AI (6 providers) | ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, MISTRAL_API_KEY, PERPLEXITY_API_KEY, OPENROUTER_API_KEY |
| AI Controls      | AI_MONTHLY_BUDGET_USD, AI_CACHE_TTL_SECONDS, AI_MAX_RETRIES                                                              |
| Payments         | RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET                                                                                     |
| AWS              | AWS_REGION, S3_BUCKET_NAME, CLOUDFRONT_DOMAIN                                                                            |
| Scraping         | SCRAPER_CONCURRENCY, SCRAPER_RATE_LIMIT_MS, PROXY_URL                                                                    |
| Monitoring       | SENTRY_DSN, POSTHOG_API_KEY                                                                                              |

---

## 9. TODOs & Roadmap

### In-Code TODOs

| Location                                           | TODO                                                     |
| -------------------------------------------------- | -------------------------------------------------------- |
| `infra/lib/examforge-stack.ts:461`                 | Phase 2: Replace App Runner with ECS Fargate             |
| `infra/lib/examforge-stack.ts:462`                 | Add Python AI microservice                               |
| `infra/lib/examforge-stack.ts:463`                 | Evaluate Aurora Serverless v2                            |
| `apps/api/src/workers/content-fetch-worker.ts:183` | AI question extraction from search results               |
| `apps/api/src/workers/content-fetch-worker.ts:228` | AI syllabus extraction from content                      |
| `apps/api/src/workers/content-fetch-worker.ts:258` | Download PDF → S3 → extract text                         |
| `apps/api/src/trpc/routers/tutorial-agent.ts:551`  | Plan-based access control (free preview, quota, credits) |
| `apps/api/src/trpc/routers/content-finder.ts:194`  | Save individual extracted questions to DB                |
| `apps/api/src/trpc/routers/syllabus.ts:55`         | Generate S3 presigned URL for syllabus upload            |

### Implementation Priority (MVP → Post-MVP)

**Phase 1 — MVP Polish**

- [ ] Credit deduction hooks on AI calls
- [ ] Razorpay webhook verification flow
- [ ] S3 presigned URL for syllabus upload
- [ ] Plan-based tutorial access control
- [ ] Save extracted questions to question bank

**Phase 2 — Content Pipeline**

- [ ] Content Finder question extraction
- [ ] PDF download + S3 storage + text extraction
- [ ] Semantic deduplication (0.92 threshold)
- [ ] Exam Discovery Agent scheduling
- [ ] Portal monitoring automation

**Phase 3 — Scale & Optimize**

- [ ] ECS Fargate migration (from App Runner)
- [ ] Aurora Serverless v2 evaluation
- [ ] Python AI microservice for ML tasks
- [ ] CDN optimization for tutorial files
- [ ] Full-text search with pg_trgm

**Phase 4 — Expansion**

- [ ] Content marketplace
- [ ] Audio/video upload + transcription
- [ ] Mobile app (React Native/Expo)
- [ ] Multi-language UI (Hindi, Tamil, Malayalam)
- [ ] Collaborative study features

---

## Appendix: Commands Reference

```bash
# Development
pnpm dev              # Start all apps (Turbo)
pnpm build            # Production build
pnpm lint             # ESLint + Prettier
pnpm lint:fix         # Auto-fix

# Database
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Run pending migrations
pnpm db:studio        # Open Drizzle Studio

# Testing
pnpm test             # Vitest
pnpm test:e2e         # Playwright E2E

# Infrastructure
pnpm infra:deploy     # AWS CDK deploy
pnpm infra:diff       # Preview CDK changes

# Workers
cd apps/api && pnpm worker      # Start BullMQ workers
cd apps/api && pnpm worker:dev  # Watch mode
```

---

## Appendix: Git Conventions

- **Branches**: `feat/`, `fix/`, `chore/`, `docs/` prefixes
- **Commits**: Conventional (`feat:`, `fix:`, `chore:`, `docs:`)
- **Merge**: Squash merge to `main` via PR
- **No direct pushes** to `main`
