# Topic Search + Scoped AI Tutor + Self-Assessing Learning Path

## Spec & Padvik → ExamForge Mapping

> **Source:** ported from Padvik (`PadVikProject`), where this shipped as a
> Next.js + REST + BIGINT feature. ExamForge is a different shape (Turborepo,
> `apps/api` Fastify + **tRPC**, `apps/web` Next.js, mixed UUID/bigint PKs,
> `orgId` multi-tenancy, `ai-router.ts`, `syllabus_nodes` tree). **Do not
> copy Padvik code verbatim — translate to the equivalents in this doc.**
>
> Companion: [`CLAUDE_CODE_IMPLEMENTATION_PROMPT.md`](./CLAUDE_CODE_IMPLEMENTATION_PROMPT.md)
> is the paste-ready, step-by-step build prompt. Read this doc first for the
> map, then drive the build from that one.

---

## 1. What the feature is (3 pillars)

1. **Topic search box (Google-style)** on the student dashboard home. Live
   autocomplete of syllabus topics; selecting a suggestion jumps straight to a
   topic, pressing Enter runs a free-text search. Lands on a **results page**.

2. **Unified results page** for the landed topic: a search-term heading (with
   timestamp + time-taken), the topic's **tutorial content rendered inline**
   (+ its questions/media), **related topics**, **recently searched** (updates
   instantly), and an **in-page scoped AI tutor** (reuses the existing per-topic
   chat — no second chat system). A scope guardrail rejects non-syllabus queries.

3. **Self-assessing learning path** — reads the student's _measured_ signals
   (understanding ratings, tutorial completion, exam performance, search misses),
   ranks what to improve **deterministically**, and uses one cheap AI call only
   to phrase it. Plus a **search-demand ranking** that feeds the existing
   tutorial/question generation workers so high-demand topics get content
   auto-generated (the ExamForge analog of "Padvik Official" auto-content).

---

## 2. Architecture translation cheat-sheet

| Concern         | Padvik                                                              | ExamForge (use this)                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API layer       | Next.js REST route handlers (`/api/...`)                            | **tRPC** routers in `apps/api/src/trpc/routers/`, registered in `apps/api/src/trpc/index.ts`                                                                                                                                                      |
| Procedure auth  | `auth()` + dev `userId=1` fallback                                  | `protectedProcedure` from `../trpc.js`; `ctx.userId`, `ctx.orgId`, `ctx.db`                                                                                                                                                                       |
| Multi-tenancy   | none                                                                | **filter every user-data query by `ctx.orgId`** and scope by `examId`                                                                                                                                                                             |
| DB access       | Drizzle `db` singleton                                              | `ctx.db` inside procedures; `import { db }` in workers/services                                                                                                                                                                                   |
| Schema location | `src/db/schema/*.ts`                                                | `packages/shared/src/db/schema/*.ts` (one file per table)                                                                                                                                                                                         |
| Migrations      | `pnpm db:generate` / `db:migrate`                                   | same commands; output `packages/shared/drizzle/` (latest = `0029`)                                                                                                                                                                                |
| PK convention   | BIGINT identity everywhere                                          | **UUID `defaultRandom()` for new tables**; FKs to the tree are **bigint** (`syllabus_nodes`, `tutorials`), to `users`/`exams` are **UUID**                                                                                                        |
| Response shape  | `{ success, data?, error? }` envelope                               | tRPC returns data directly (framework wraps it); throw `TRPCError` for failures. Keep internal service helpers returning typed objects                                                                                                            |
| AI entry point  | `aiChat(msg, opts)` in `src/lib/ai/provider.ts` — **do not modify** | `routeAIRequest({task, userId, examId, prompt, systemPrompt, schema, …}, db)` / `routeTextRequest(...)` in `apps/api/src/ai/ai-router.ts` — **do not modify the router; add a task to `TASK_PROVIDER_MAP` if you need a new cheap model mapping** |
| Cheap model     | `AI_MODELS.BULK` (Haiku)                                            | a `TASK_PROVIDER_MAP` entry mapped to a cheap model (e.g. `gemini-2.5-flash` / `gpt-4o-mini`-class). Add task `classify_search_scope` + `assess_learning_path`                                                                                    |
| Web tRPC client | n/a                                                                 | `trpc` from `apps/web/src/lib/trpc.ts`; `trpc.X.useQuery/useMutation()`                                                                                                                                                                           |
| Theme           | violet `#7C3AED` hardcoded                                          | **neutral grayscale brand** — use semantic tokens (`bg-primary`, `text-primary`, `bg-accent`, `border`), **do not hardcode violet**                                                                                                               |

---

## 3. Data-dependency mapping (what to reuse vs build)

| Padvik dependency                                         | ExamForge analog                                                                                                                     | File(s)                                                                                                | Reuse / Build                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `topics` (leaf of board→…→topic)                          | **`syllabus_nodes`** (self-ref tree: `parentId`, `nodeType`, `depth`, `syllabusId`; bigint PK)                                       | `packages/shared/src/db/schema/syllabus-nodes.ts`                                                      | reuse                                                                      |
| board/grade/subject context of a topic                    | walk `syllabus_nodes.parentId` → `syllabi.examId` → `exams`                                                                          | `…/schema/syllabi.ts`, `…/exams.ts`                                                                    | reuse                                                                      |
| `content_items` (markdown notes)                          | **`tutorials`** (JSONB `content.sections[]` with `htmlContent`/`plainText`; `contentText` for search; `isCurrent`, `syllabusNodeId`) | `…/schema/tutorials.ts`                                                                                | reuse                                                                      |
| `creator_content` media + "Padvik Official"               | tutorials are system/agent-generated → treat agent tutorials as the "official" content. There is **no official-vs-creator flag**     | —                                                                                                      | build (optional flag)                                                      |
| `questions` for a topic                                   | **`questions`** (UUID; `syllabusNodeId`, verification trust tiers) + `tutorial_questions` join                                       | `…/schema/questions.ts`, `…/schema/tutorial-questions.ts`                                              | reuse                                                                      |
| `reading_progress`                                        | **`tutorial_progress`** (`sectionsRead`, `completionPercent`, `syllabusNodeId`)                                                      | `…/schema/tutorial-progress.ts`                                                                        | reuse                                                                      |
| `topic_understanding` (red/orange/green)                  | **none**                                                                                                                             | —                                                                                                      | **BUILD: `node_understanding`**                                            |
| `topic_conversations` (per-topic chat)                    | **`topic_conversations`** (UUID; `syllabusNodeId`, `messages` JSONB, `contextType/contextId`)                                        | `…/schema/topic-conversations.ts`                                                                      | reuse                                                                      |
| `/api/learn/chat` + chat UI                               | **`learn.sendChatMessage`** tRPC + **`LearnChat`** component                                                                         | `apps/api/src/trpc/routers/learn.ts`, `apps/web/src/app/(dashboard)/learn/[syllabusId]/learn-chat.tsx` | reuse                                                                      |
| `/api/syllabus/search` (topic title search)               | **none** (content-finder is external web/PDF search)                                                                                 | —                                                                                                      | **BUILD: node title search**                                               |
| `/api/learn/search` (content FTS)                         | search `tutorials.contentText` (ILIKE / FTS / pgvector)                                                                              | `…/schema/tutorials.ts`                                                                                | **BUILD**                                                                  |
| `demand-tracker` + `contentDemandSignals`                 | **none**                                                                                                                             | —                                                                                                      | **BUILD: `content_demand_signals` + tracker**                              |
| auto-content orchestrator (cron)                          | **`tutorial-agent-worker`**, **`topic-generation-worker`** (on-demand only)                                                          | `apps/api/src/workers/*.ts`                                                                            | reuse workers; **BUILD scheduler**                                         |
| `topic_search_history`                                    | **none**                                                                                                                             | —                                                                                                      | **BUILD**                                                                  |
| `learning_path_assessments`                               | **none**                                                                                                                             | —                                                                                                      | **BUILD**                                                                  |
| `useBoardSelection()`                                     | no hook; selected exams are **query-driven**                                                                                         | `trpc.learn.getDashboardData` / `trpc.onboarding.getOnboardingStatus`                                  | reuse                                                                      |
| `dashboard-home.tsx`                                      | dashboard home page                                                                                                                  | `apps/web/src/app/(dashboard)/dashboard/page.tsx`                                                      | edit (additive)                                                            |
| sidebar nav                                               | `STUDENT_NAV` array                                                                                                                  | `apps/web/src/app/(dashboard)/layout.tsx`                                                              | edit (additive)                                                            |
| `MarkdownRenderer`                                        | markdown renderer                                                                                                                    | `apps/web/src/components/content/markdown-renderer.tsx`                                                | reuse                                                                      |
| `ContentTypeIcon` / `VisualCardsButton` / explainer decks | **no adaptive card-deck system**; closest is the tutorial reader + per-node images                                                   | `learn/[syllabusId]/…`, `syllabus_nodes.imageUrl`                                                      | N/A — drop the "Visual Cards" piece or link to the tutorial reader instead |
| existing search results page                              | content finder (different pattern)                                                                                                   | `apps/web/src/app/(dashboard)/dashboard/find/page.tsx`                                                 | reference only                                                             |

---

## 4. Gaps to build (net-new in ExamForge)

1. **`node_understanding`** — per-(user, syllabus_node) red/orange/green rating (+ a way to set it from the tutorial reader). Mirrors `topic_understanding`.
2. **`content_demand_signals`** + a `tracker` service (`trackDemandSignal(nodeId, type, userId, weight, examId, orgId)`), aggregation (`calculateDemandScores`), and `getTopDemandNodes()`. Mirrors Padvik's demand-tracker.
3. **`topic_search_history`** — append-only search log per user.
4. **`learning_path_assessments`** — cached AI self-assessment snapshots (TTL).
5. **Internal topic search** — a `topicSearch` tRPC router: node-title search + `tutorials.contentText` search + suggestions + history + a per-node "bundle".
6. **Results page** + **learning path page** (web) — reusing `LearnChat`, `MarkdownRenderer`, the tutorial-section renderer.
7. **Demand-driven generation scheduler** — a repeatable BullMQ job that reads demand scores and enqueues the **existing** `tutorial-agent-worker` / `topic-generation-worker` for top-demand nodes lacking content. Mirrors Padvik's orchestrator cron.

**Advantage over Padvik:** ExamForge already has rich exam signals
(`user_progress.weakSubjects/strongSubjects/subjectScores`, `exam_sessions`).
The learning path should fold these in — it can be _stronger_ than Padvik's,
which had only self-rated understanding + reading completion.

---

## 5. Hard constraints (ExamForge-specific)

- **Do NOT modify `apps/api/src/ai/ai-router.ts`'s core routing.** Add new
  entries to `TASK_PROVIDER_MAP` for `classify_search_scope` (cheap model) and
  `assess_learning_path` (cheap model), then call `routeAIRequest`/`routeTextRequest`.
- **Every user-data query filters by `ctx.orgId`** and scopes by `examId` where
  the table has it.
- **PK discipline:** new tables use **UUID `defaultRandom()`**; FK columns to
  `syllabus_nodes`/`tutorials` are **bigint**, to `users`/`exams` are **UUID**.
  Get the join types right (this is the #1 porting bug).
- **Zod-validate every tRPC input.** AI JSON parsed defensively (strip fences,
  try/catch, **fail-open** for the scope guard, **deterministic fallback** for
  the learning path). The overall readiness score is always computed in code,
  never AI-dependent.
- **Tutorial content is JSONB sections (`htmlContent`/`plainText`), not
  markdown.** Render via the existing tutorial-section renderer (or feed
  `plainText`/section bodies to `MarkdownRenderer`). Do not assume a markdown body.
- **Reuse `LearnChat` for the scoped tutor.** The only permitted change to the
  chat path is an **optional** scope-preamble field on `learn.sendChatMessage`'s
  Zod input (additive, backward-compatible).
- **Theme:** neutral/grayscale tokens, no hardcoded violet.
- **Cost-cap:** scope guard uses AI only for the ambiguous middle; learning-path
  AI runs at most once per (user, scope) per TTL; both use a cheap model task.

---

## 6. Suggested file layout (new)

```
packages/shared/src/db/schema/
  node-understanding.ts          # red/orange/green per node
  content-demand-signals.ts      # search-ranking signals
  topic-search-history.ts        # per-user search log
  learning-path-assessments.ts   # cached AI snapshots
packages/shared/src/search/
  scope-guard.ts                 # heuristic + cheap-AI classifier (fail-open)
  node-search.ts                 # shared node+tutorial search queries
packages/shared/src/learning-path/
  assess.ts                      # gather signals → rank → narrate
apps/api/src/trpc/routers/
  topic-search.ts                # suggest / search / history / bundle
  learning-path.ts               # get (cached) / refresh
apps/api/src/lib/auto-content/
  demand-tracker.ts              # track + score + getTopDemandNodes
apps/api/src/workers/
  auto-content-scheduler.ts      # repeatable job → enqueue existing workers
apps/web/src/app/(dashboard)/dashboard/search/
  page.tsx, _components/search-results.tsx
apps/web/src/app/(dashboard)/dashboard/learning-path/
  page.tsx, _components/learning-path-view.tsx
apps/web/src/components/search/
  topic-search-box.tsx           # shared autocomplete box
```

Pure-logic libs go in `packages/shared` (no Fastify/Next imports) so both
`apps/api` and any worker can use them. tRPC routers and workers live in
`apps/api`. UI lives in `apps/web`.
