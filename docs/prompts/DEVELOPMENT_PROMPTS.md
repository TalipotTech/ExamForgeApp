# AI Development Prompts for ExamForge

This document contains tested prompts for using Claude Code and Cursor
to build ExamForge features. Copy-paste these directly into your IDE.

---

## Table of Contents

1. [Project Initialization Prompts](#1-project-initialization)
2. [Feature Development Prompts](#2-feature-development)
3. [AI Integration Prompts](#3-ai-integration)
4. [Database & Schema Prompts](#4-database--schema)
5. [AWS Infrastructure Prompts](#5-aws-infrastructure)
6. [Testing Prompts](#6-testing)
7. [Debugging Prompts](#7-debugging)
8. [Question Generation System Prompts](#8-question-generation-system-prompts)

---

## 1. Project Initialization

### Bootstrap the Monorepo (Claude Code)
```
Set up a Turborepo monorepo for ExamForge with:
- apps/web: Next.js 15 with App Router, TypeScript strict, Tailwind v4, shadcn/ui
- apps/api: Fastify 5 with tRPC v11, BullMQ
- packages/shared: Zod schemas, Drizzle ORM schema, shared types
- infra: AWS CDK TypeScript stack

Use pnpm workspaces. Add scripts in root package.json for:
dev, build, lint, test, type-check, db:generate, db:migrate, infra:deploy

Set up ESLint flat config, Prettier, and Vitest config shared across packages.
Read CLAUDE.md for all conventions.
```

### Initialize Database Schema (Claude Code)
```
Create the Drizzle ORM schema in packages/shared/src/db/schema/ with these tables:

1. users — id (UUID), email, name, phone, role (student|admin|instructor), org_id, avatar_url
2. organizations — id, name, slug, plan (free|pro|enterprise), settings (JSONB)
3. exams — id, name, category, subjects (JSONB array), is_active, org_id
4. questions — id, exam_id, type (mcq|true_false|fill_blank|match|assertion), content (JSONB), answer, explanation, subject, difficulty (easy|medium|hard), source, embedding (vector 1536), translations (JSONB), org_id
5. question_versions — id, question_id, content (JSONB), changed_by, change_type
6. exam_sessions — id, user_id, exam_id, questions (JSONB), answers (JSONB), score, time_taken_seconds, started_at, completed_at
7. scrape_sources — id, name, url, status, last_scraped_at, questions_count, config (JSONB)
8. ai_usage_logs — id, user_id, provider, model, input_tokens, output_tokens, latency_ms, cost_usd, feature, exam_id

Every table must have created_at, updated_at, exam_id (nullable for org-level tables).
Follow all conventions in CLAUDE.md. Use pgvector for embedding column.
Generate the initial migration with Drizzle Kit.
```

---

## 2. Feature Development

### Build the Question Bank UI (Cursor)
```
Create the Question Bank page at apps/web/src/app/(dashboard)/questions/page.tsx

Requirements:
- Server Component that fetches questions via tRPC
- Client-side filtering by: subject, difficulty, exam, source, question type
- Search bar with debounced full-text search
- Expandable question cards showing: question text, options (highlighted answer), explanation
- Badges for difficulty, subject, source
- Delete and edit actions
- Pagination (20 per page)

Use shadcn/ui components: Card, Badge, Input, Select, Button, Skeleton loader.
Use TanStack Query for client-side data fetching with prefetching from RSC.
Follow the project conventions in .cursor/rules/project.mdc.
```

### Build the Exam-Taking Interface (Cursor)
```
Create the exam-taking flow at apps/web/src/app/(exam)/take/[sessionId]/page.tsx

Requirements:
- Full-screen exam mode with timer (countdown from total minutes)
- Question navigation sidebar (numbered circles, color-coded: answered/unanswered/flagged)
- Single question display with 4 options (radio buttons, keyboard shortcuts A-D)
- Flag/bookmark toggle per question
- Previous/Next navigation with keyboard arrows
- Submit confirmation modal
- Results page: score, time, per-question breakdown with correct answer + explanation
- Auto-save answers to server every 30 seconds (tRPC mutation)
- Handle browser close/refresh: warn user, restore state from server

State management: Zustand store for local exam state.
Use Framer Motion for question transitions.
Mobile responsive: stack sidebar below question on small screens.
```

### Build the AI Question Generator Form (Cursor)
```
Create the AI question generator at apps/web/src/app/(dashboard)/generate/page.tsx

Requirements:
- Form with: AI provider selector, exam/subject dropdowns, topic input, count (1-50),
  difficulty selector, question type selector (MCQ, True/False, Fill-blank, Match, Assertion-Reason)
- Custom prompt textarea (optional override)
- Provider info panel showing: selected model, features, estimated cost
- Generate button with streaming progress indicator
- Results preview: generated questions with accept/reject/edit per question
- Bulk save accepted questions to database
- Cost summary after generation: tokens used, estimated cost

Use the Vercel AI SDK useChat hook for streaming.
Call the tRPC generateQuestions mutation which routes through ai-router.ts.
Show a toast notification on save success.
```

---

## 3. AI Integration

### Create the AI Router (Claude Code)
```
Create apps/api/src/ai/ai-router.ts — a central AI provider routing module.

It should:
1. Export an async function: routeAIRequest(task, params) that selects the optimal
   provider based on the task type:
   - "generate_question" → Claude (quality) or Mistral (bulk, if count > 20)
   - "generate_from_video" → Gemini (native video support)
   - "generate_from_document" → Claude (document analysis)
   - "verify_answer" → Claude with RAG context
   - "search_current_affairs" → Perplexity
   - "embed_text" → OpenAI text-embedding-3-small
   - "translate" → Gemini (multilingual)
   - "classify_difficulty" → Mistral (cheapest)

2. Check Redis cache first (hash of: provider + model + prompt)
3. Implement retry with exponential backoff (1s, 2s, 4s, max 3 retries)
4. Log to ai_usage_logs table: provider, model, tokens, latency, cost
5. Validate ALL responses through Instructor.js with Zod schemas
6. Implement fallback: if primary provider fails 3x, try next best provider
7. Respect per-user rate limits (from env: AI_RATE_LIMIT_PER_USER_PER_MIN)
8. Check monthly budget (AI_MONTHLY_BUDGET_USD) before making calls

Use the Vercel AI SDK for streaming responses.
Use Instructor.js for structured output validation.
Follow conventions in .claude/rules/ai-patterns.md.
```

### Create the Scraping Agent (Claude Code)
```
Create apps/api/src/workers/scraper-worker.ts — a BullMQ worker for web scraping.

Architecture:
1. Job receives: { sourceId, url, examId, maxPages }
2. Use Crawlee with Playwright for JS-heavy sites, Cheerio for static HTML
3. For each page:
   a. Extract raw HTML/text content
   b. Send to Claude via ai-router: "Extract exam questions from this content"
   c. Claude returns structured QuestionSchema[] array
   d. Check for duplicates using embedding cosine similarity (threshold: 0.92)
   e. Save new questions to DB with source attribution
4. Emit progress events via BullMQ (for real-time UI updates)
5. Respect rate limits: configurable delay between page fetches
6. Handle errors: retry individual pages, skip permanently failed ones
7. Log scrape results: pages visited, questions found, duplicates skipped

Add BullMQ job scheduling: repeatable jobs per source (daily/weekly).
Follow CLAUDE.md conventions for error handling and logging.
```

### Question Generation System Prompt (for ai-router.ts)
```
Create apps/api/src/ai/prompts/question-generation.ts

Export a function that builds the system prompt for question generation.
The prompt should:

1. Role: "You are an expert exam question setter for Indian competitive
   examinations. You specialize in {exam_name} with deep knowledge of
   {subject}."

2. Output format: Force JSON output matching QuestionSchema
   { question, options (4), answer (0-3 index), explanation, difficulty, subject }

3. Quality rules:
   - Questions must test conceptual understanding, not just recall
   - All 4 options must be plausible (no obviously wrong distractors)
   - Explanation must cite specific facts/principles
   - Match the difficulty level: easy (direct recall), medium (application),
     hard (analysis/multi-step)
   - For BPharm: follow PCI curriculum and university exam patterns
   - For NEET: follow NTA pattern with assertion-reason questions
   - Include clinical case-based questions for Pharmacology

4. Indian context:
   - Use drug names common in Indian pharmacopoeia (IP)
   - Reference Indian healthcare scenarios
   - Include questions relevant to Indian regulatory bodies (CDSCO, PCI, MCI)
   - Use examples from commonly prescribed drugs in Indian hospitals

5. Variation: Never repeat question patterns. Vary between:
   - Direct factual, Application-based, Clinical scenario,
     Assertion-Reason, Image-based description, Calculation-based

Accept parameters: exam, subject, topic, difficulty, count, questionType, customPrompt
```

---

## 4. Database & Schema

### Add a New Exam Vertical (Claude Code)
```
I need to add support for NEET UG exam. Create:
1. Seed data in packages/shared/src/db/seeds/neet-ug.ts with:
   - Exam record: name="NEET UG", category="medical", subjects=["Physics","Chemistry","Biology"]
   - 10 sample questions per subject (realistic NEET pattern)

2. Update the exam constants in packages/shared/src/constants/exams.ts

3. Add NEET-specific question generation prompt adjustments in
   apps/api/src/ai/prompts/neet-config.ts

Follow existing patterns. Run db:generate after schema changes.
```

### Create Migration for New Feature (Claude Code)
```
I need to add a "question_reports" table for users to flag incorrect questions.
Fields: id, question_id (FK), user_id (FK), report_type (incorrect_answer|
unclear_question|duplicate|outdated), description, status (pending|reviewed|
resolved|rejected), reviewed_by, reviewed_at.

Create the Drizzle schema, generate migration, and add the tRPC router
with endpoints: create, list (admin), update status (admin).
Add Zod validators in packages/shared/src/validators/.
```

---

## 5. AWS Infrastructure

### Create the CDK Stack (Claude Code)
```
Create infra/lib/examforge-stack.ts using AWS CDK v2 (TypeScript).

The stack should provision:
1. VPC with 2 AZs, public/private/isolated subnets, NAT Gateway
2. RDS PostgreSQL 17 (db.t4g.micro) in isolated subnet, encrypted, 7-day backup
3. ElastiCache Redis 7 (cache.t4g.micro) in isolated subnet
4. ECR repositories: examforge-web, examforge-api
5. App Runner services for web and api with VPC connector to private subnets
6. S3 bucket for uploads with lifecycle rules (IA after 90 days)
7. CloudFront distribution: origins = S3 + App Runner
8. Secrets Manager entries for all API keys (initially with dummy values)
9. CloudWatch log groups and basic alarms (CPU, memory, 5xx errors)
10. SNS topic for alerts → email subscription

Accept context variables: env (dev/staging/prod), imageTag (git SHA).
Region: ap-south-1 ALWAYS.
Tag all resources: project=examforge, environment={env}.

Follow AWS best practices: least-privilege IAM, encryption at rest,
no public DB access. Read docs/aws/AWS_CONFIGURATION.md for details.
```

### Add Monitoring Stack (Claude Code)
```
Create infra/lib/monitoring-stack.ts for CloudWatch dashboards:

1. Dashboard with widgets:
   - App Runner: request count, latency P50/P95, 2xx/4xx/5xx rates
   - RDS: CPU, connections, storage, read/write IOPS
   - ElastiCache: memory usage, cache hit rate, connections
   - Custom: AI API cost (daily), active exam sessions, questions generated

2. Alarms:
   - RDS CPU > 80% for 10 minutes
   - Redis memory > 70%
   - App Runner 5xx > 10 in 5 minutes
   - AI daily cost > $10
   - S3 storage > 100GB

3. SNS notifications to email + optional Slack webhook
```

---

## 6. Testing

### Write Tests for Question Generation (Claude Code)
```
Write comprehensive tests for apps/api/src/ai/ai-router.ts:

1. Unit tests (Vitest):
   - Test provider selection logic for each task type
   - Test Redis cache hit/miss behavior (mock Redis)
   - Test retry logic: succeed on 2nd attempt, fail after 3 retries
   - Test budget limit enforcement
   - Test rate limiting per user
   - Test fallback provider selection
   - Test Zod validation on AI responses (valid + invalid)

2. Integration tests:
   - Test with real DB: question saved after generation
   - Test ai_usage_logs entry created correctly
   - Test duplicate detection via embedding similarity

Mock AI providers using Vitest vi.mock().
Use @faker-js/faker for test data.
Follow CLAUDE.md testing conventions.
```

### Write E2E Tests for Exam Flow (Claude Code)
```
Write Playwright E2E tests at apps/web/e2e/exam-flow.spec.ts:

1. test("user can start and complete an exam"):
   - Login → Navigate to exam page → Select exam → Set question count
   - Start exam → Answer all questions (click options) → Submit
   - Verify results page shows correct score

2. test("exam state persists on page refresh"):
   - Start exam → Answer 3 questions → Refresh page
   - Verify answers are restored, timer continues

3. test("exam timer works correctly"):
   - Start exam → Wait 5 seconds → Verify timer updated
   - Verify timer displays in MM:SS format

4. test("question navigation works"):
   - Start exam → Navigate with Next/Previous buttons
   - Navigate with keyboard arrows
   - Click question number in sidebar

Use test fixtures for: logged-in user, exam with seeded questions.
Run against local dev server with test database.
```

---

## 7. Debugging

### Debug AI Response Issues (Claude Code)
```
The AI question generator is returning invalid JSON occasionally. Debug this:

1. Check the ai_usage_logs table for recent failures:
   SELECT * FROM ai_usage_logs WHERE created_at > now() - interval '1 hour'
   ORDER BY created_at DESC;

2. Look at the raw AI responses in the logs
3. Check if Instructor.js validation is catching malformed responses
4. Add better error handling: if validation fails, retry with a
   "Please fix the following validation errors:" prompt
5. Add a dead letter queue for persistently failing generation requests

Show me the logs and suggest fixes.
```

### Debug Performance Issues (Cursor)
```
The question bank page is slow to load with 10,000+ questions. Profile and fix:

1. Check if the tRPC query is missing pagination (should be server-side)
2. Verify DB has indexes on: exam_id, subject, difficulty, created_at
3. Check if full-text search is using pg_trgm index
4. Ensure TanStack Query has proper staleTime and cacheTime
5. Check if the question list is virtualized for large lists (use @tanstack/virtual)
6. Profile with React DevTools — look for unnecessary re-renders

Apply fixes following project conventions.
```

---

## 8. Question Generation System Prompts

### BPharm Assistant Professor — Pharmacology
```
You are an expert question setter for the BPharm Assistant Professor
examination conducted by State Public Service Commissions in India.

Generate {count} multiple-choice questions on {topic} in Pharmacology.

Requirements:
- Each question must have exactly 4 options labeled A, B, C, D
- Only ONE correct answer
- Difficulty: {difficulty}
- Questions should cover: mechanism of action, pharmacokinetics,
  adverse effects, drug interactions, clinical applications
- Use drug names from the Indian Pharmacopoeia (IP)
- Include questions on: drug classification, receptor pharmacology,
  dose calculations, and clinical case scenarios
- Distractors must be plausible (commonly confused drugs/mechanisms)
- Explanation must cite pharmacological principles with standard
  textbook references (Rang & Dale, Tripathi, KD Tripathi)

Output ONLY valid JSON array matching this schema:
[{
  "question": "string",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "answer": 0-3,
  "explanation": "string",
  "subject": "Pharmacology",
  "difficulty": "easy|medium|hard"
}]
```

### NEET UG — Biology
```
You are an expert NEET UG question setter following NTA examination
patterns. Generate {count} MCQs on {topic} in Biology.

Requirements:
- Strictly follow NCERT Class 11 and 12 Biology syllabus
- Include Assertion-Reason type questions (20% of total)
- Difficulty distribution: 30% easy, 50% medium, 20% hard
- Cover both Botany and Zoology as per topic
- Questions should test conceptual understanding, not rote memorization
- Include diagram-based questions (describe the diagram in text)
- Use standard biological nomenclature

For Assertion-Reason questions, use this format:
- Assertion (A): [statement]
- Reason (R): [statement]
- Options: A) Both correct, R explains A | B) Both correct, R doesn't
  explain A | C) A correct, R incorrect | D) A incorrect, R correct

Output ONLY valid JSON matching QuestionSchema.
```
