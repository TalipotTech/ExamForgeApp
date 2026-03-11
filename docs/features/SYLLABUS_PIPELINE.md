# Feature: Syllabus Intelligence Pipeline

> **Status:** Active Development
> **Branch:** `feat/syllabus-pipeline`
> **Priority:** P0 — Core differentiating feature

---

## 1. Overview

The Syllabus Intelligence Pipeline transforms a static PDF syllabus into an
interactive, AI-powered learning and exam preparation system. The pipeline
has five stages:

```
PDF Upload → Document Intelligence → Structured Syllabus Tree → Tutorial Generation → MCQ/Exam Generation
     ↓              ↓                        ↓                       ↓                      ↓
   S3 store    AI extraction         syllabus_nodes DB         tutorials DB          questions DB
```

The key differentiator is **user-controlled multi-agent AI**: for any
generation step, the user selects which AI providers to use — a single
provider for speed/cost, or multiple providers in parallel for
comprehensive, cross-validated content.

---

## 2. User Flow

### 2.1 Upload Syllabus

1. User navigates to Dashboard → Syllabus → Upload
2. Drags and drops a PDF (or clicks to browse)
3. Selects the target exam (BPharm Asst Prof, NEET, etc.)
4. Clicks "Process Syllabus"
5. PDF uploads to S3, processing job queued
6. Progress indicator: uploading → extracting text → parsing structure → done

### 2.2 View & Explore Syllabus

1. After processing, user sees a collapsible tree view:
   ```
   📘 BPharm Assistant Professor Syllabus 2025
   ├── 📂 Unit I: Pharmaceutics
   │   ├── 📄 1.1 Introduction to Dosage Forms
   │   │   ├── 📝 Definition: Dosage Form
   │   │   ├── 📝 Classification of Dosage Forms
   │   │   └── 📝 Advantages of Different Dosage Forms
   │   ├── 📄 1.2 Tablet Technology
   │   │   ├── 📝 Tablet Manufacturing Methods
   │   │   ├── 📝 Wet Granulation
   │   │   └── 📝 Direct Compression
   │   └── 📄 1.3 Capsule Formulation
   ├── 📂 Unit II: Pharmacology
   │   ├── 📄 2.1 General Pharmacology
   │   └── 📄 2.2 Autonomic Nervous System
   └── ...
   ```
2. Each node shows: title, description (if parsed), status badges
3. Status badges per node:
   - ⬜ Not started
   - 📖 Tutorial generated
   - ✅ MCQs available
   - 🎯 Exam ready

### 2.3 Generate Tutorial for a Topic

1. User clicks on any node (e.g., "1.2 Tablet Technology")
2. **AI Provider Selector** appears:
   - [ ] Claude (Deep reasoning, detailed explanations)
   - [ ] Gemini (Long context, visual descriptions)
   - [ ] OpenAI (Structured output, concise)
   - [ ] Mistral (Fast, cost-effective)
   - [ ] Perplexity (Web-backed, current references)
   - [★] Use All Providers (comprehensive, merged)
3. User selects provider(s) and clicks "Generate Tutorial"
4. Progress: Generating with Claude... Generating with Gemini... Merging...
5. Tutorial appears with:
   - Introduction & learning objectives
   - Detailed explanation with subheadings
   - Key definitions (highlighted)
   - Important formulas / diagrams (described)
   - Clinical/practical applications
   - Summary & key takeaways
   - References (textbook citations)
6. If multi-agent: content is merged, deduplicated, with attribution tags

### 2.4 Generate MCQs from Tutorial

1. From the tutorial view, user clicks "Generate MCQs"
2. Configures: count (5-50), difficulty mix, question types
3. Selects AI provider(s) (same selector)
4. MCQs generated from the tutorial content (not just topic name)
5. Review screen: accept ✓, reject ✗, edit ✏ each question
6. Accepted questions saved to database, linked to syllabus node

### 2.5 Create Exam from Syllabus

1. User selects multiple syllabus nodes (checkboxes on tree)
2. Configures: total questions, time limit, difficulty distribution
3. System pulls from `tutorial_questions` for selected nodes
4. If insufficient questions, offers to generate more
5. Creates exam session → redirects to exam-taking interface

---

## 3. Database Schema

### 3.1 New Tables

```sql
-- Uploaded syllabus documents
CREATE TABLE syllabi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id),
  org_id UUID REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,           -- "BPharm Asst Prof Syllabus 2025"
  file_key VARCHAR(500) NOT NULL,       -- S3 object key
  file_url VARCHAR(1000),               -- CloudFront URL
  file_size_bytes INTEGER,
  mime_type VARCHAR(100) DEFAULT 'application/pdf',
  status VARCHAR(20) NOT NULL DEFAULT 'uploading',
    -- uploading | processing | parsed | error
  error_message TEXT,
  raw_text TEXT,                         -- Full extracted text (for search)
  page_count INTEGER,
  extraction_method VARCHAR(50),         -- pdf-parse | claude-vision | gemini | azure-di
  metadata JSONB DEFAULT '{}',           -- Year, university, edition, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

-- Hierarchical syllabus structure (adjacency list)
CREATE TABLE syllabus_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_id UUID NOT NULL REFERENCES syllabi(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES syllabus_nodes(id) ON DELETE CASCADE,
  node_type VARCHAR(20) NOT NULL,
    -- unit | chapter | topic | subtopic | definition | formula | objective
  title VARCHAR(500) NOT NULL,
  description TEXT,                      -- Parsed description from syllabus
  content TEXT,                          -- Full text content for this node
  sort_order INTEGER NOT NULL DEFAULT 0, -- Preserve syllabus ordering
  depth INTEGER NOT NULL DEFAULT 0,      -- 0=root, 1=unit, 2=topic, 3=subtopic
  key_terms JSONB DEFAULT '[]',          -- ["dosage form", "bioavailability", ...]
  metadata JSONB DEFAULT '{}',           -- Hours, credits, marks weightage
  tutorial_status VARCHAR(20) DEFAULT 'none',
    -- none | generating | generated | error
  mcq_status VARCHAR(20) DEFAULT 'none',
    -- none | generating | generated | error
  mcq_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_syllabus_nodes_syllabus ON syllabus_nodes(syllabus_id);
CREATE INDEX idx_syllabus_nodes_parent ON syllabus_nodes(parent_id);
CREATE INDEX idx_syllabus_nodes_type ON syllabus_nodes(node_type);

-- AI-generated tutorials for syllabus nodes
CREATE TABLE tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_node_id UUID NOT NULL REFERENCES syllabus_nodes(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id),
  org_id UUID REFERENCES organizations(id),
  version INTEGER NOT NULL DEFAULT 1,
  title VARCHAR(500) NOT NULL,
  content JSONB NOT NULL,                -- Structured tutorial content (see 3.2)
  content_text TEXT NOT NULL,            -- Plain text version (for search + MCQ gen)
  providers_used JSONB NOT NULL,         -- ["claude", "gemini"] — which providers
  generation_config JSONB DEFAULT '{}',  -- Model versions, prompts used, params
  word_count INTEGER,
  estimated_read_minutes INTEGER,
  quality_score REAL,                    -- Optional: AI-assessed quality 0-1
  is_current BOOLEAN DEFAULT true,       -- Marks the active version
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_tutorials_node ON tutorials(syllabus_node_id);
CREATE INDEX idx_tutorials_current ON tutorials(syllabus_node_id, is_current)
  WHERE is_current = true;

-- MCQs generated from tutorial content
CREATE TABLE tutorial_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutorial_id UUID NOT NULL REFERENCES tutorials(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  syllabus_node_id UUID NOT NULL REFERENCES syllabus_nodes(id),
  -- Links a question back to its source tutorial and syllabus node
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tq_tutorial ON tutorial_questions(tutorial_id);
CREATE INDEX idx_tq_node ON tutorial_questions(syllabus_node_id);
```

### 3.2 Tutorial Content JSONB Structure

```typescript
interface TutorialContent {
  sections: {
    type:
      | "introduction"
      | "explanation"
      | "definition"
      | "formula"
      | "example"
      | "application"
      | "summary"
      | "references";
    title: string;
    body: string; // Markdown formatted
    provider?: string; // Which AI generated this section
    key_terms?: string[]; // Highlighted terms
  }[];
  learning_objectives: string[];
  key_definitions: { term: string; definition: string }[];
  formulas?: { name: string; formula: string; explanation: string }[];
  mnemonics?: { topic: string; mnemonic: string }[];
  clinical_applications?: string[]; // For medical/pharma exams
  difficulty_level: "introductory" | "intermediate" | "advanced";
}
```

### 3.3 Drizzle Schema Files to Create

| File                                                  | Table                |
| ----------------------------------------------------- | -------------------- |
| `packages/shared/src/db/schema/syllabi.ts`            | `syllabi`            |
| `packages/shared/src/db/schema/syllabus-nodes.ts`     | `syllabus_nodes`     |
| `packages/shared/src/db/schema/tutorials.ts`          | `tutorials`          |
| `packages/shared/src/db/schema/tutorial-questions.ts` | `tutorial_questions` |

---

## 4. Multi-Agent AI Architecture

### 4.1 Provider Selection Component

```typescript
// Reusable across all AI features
interface AIProviderSelection {
  mode: "single" | "multi";
  providers: AIProviderId[]; // ['claude', 'gemini', 'openai', ...]
}

type AIProviderId = "claude" | "gemini" | "openai" | "mistral" | "perplexity";
```

### 4.2 Single Provider Mode

```
User selects "Claude" → ai-router routes to Claude → validate → save
```

### 4.3 Multi-Agent Mode ("Use All")

```
User selects "Use All" (or picks multiple)
  → Fan-out: send prompt to each selected provider in parallel
  → Collect: wait for all responses (with timeout)
  → Merge: intelligent content merging
    - Deduplicate overlapping explanations
    - Keep unique insights from each provider
    - Combine definitions (most comprehensive wins)
    - Merge examples (remove duplicates, keep diverse ones)
    - Attribution: tag which provider contributed what
  → Validate: Instructor.js/Zod on merged result
  → Save: store merged tutorial + per-provider attribution
```

### 4.4 Multi-Agent Implementation

```typescript
// apps/api/src/ai/multi-agent.ts

interface MultiAgentRequest {
  task: "generate_tutorial" | "generate_mcq" | "verify_answer";
  providers: AIProviderId[];
  prompt: string;
  schema: ZodSchema; // For validation
  mergeStrategy: "combine" | "best_of" | "vote";
}

interface MultiAgentResult<T> {
  merged: T; // Final merged result
  perProvider: Record<
    AIProviderId,
    {
      result: T;
      latencyMs: number;
      tokensUsed: { input: number; output: number };
      costUsd: number;
    }
  >;
  mergeMetadata: {
    strategy: string;
    conflictsResolved: number;
    uniqueContributions: Record<AIProviderId, number>;
  };
}
```

### 4.5 Merge Strategies

| Strategy  | When to Use         | How It Works                                                 |
| --------- | ------------------- | ------------------------------------------------------------ |
| `combine` | Tutorials           | Merge all unique sections, deduplicate, attribute            |
| `best_of` | MCQs                | Generate from each, pick best per Zod validation + diversity |
| `vote`    | Answer verification | Majority vote on correct answer across providers             |

---

## 5. PDF Processing Pipeline

### 5.1 Text Extraction Priority

| Method        | When                                  | Library                     |
| ------------- | ------------------------------------- | --------------------------- |
| pdf-parse     | Text-based PDFs (90% of syllabi)      | `pdf-parse` npm             |
| Claude Vision | Scanned PDFs, tables, complex layouts | Anthropic API (vision)      |
| Gemini        | Very long documents (100+ pages)      | Google AI API (1M context)  |
| Azure DI      | Government PDFs with forms/stamps     | `@azure/ai-form-recognizer` |

### 5.2 Syllabus Structure Extraction Prompt

```
Given the raw text of an exam syllabus, extract a hierarchical structure.

Output JSON matching this schema:
{
  "nodes": [
    {
      "title": "Unit I: Pharmaceutics",
      "type": "unit",
      "depth": 1,
      "sort_order": 1,
      "description": "...",
      "key_terms": ["dosage forms", "..."],
      "children": [
        {
          "title": "1.1 Introduction to Dosage Forms",
          "type": "topic",
          "depth": 2,
          "sort_order": 1,
          "description": "...",
          "key_terms": [...],
          "children": [
            {
              "title": "Definition: Dosage Form",
              "type": "definition",
              "depth": 3,
              "content": "A dosage form is...",
              "children": []
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- Preserve the exact hierarchy from the syllabus
- type must be one of: unit, chapter, topic, subtopic, definition, formula, objective
- Extract ALL items — do not skip or summarize
- key_terms: important technical terms mentioned in that section
- If marks/hours/credits are mentioned, include in description
```

---

## 6. API Endpoints (tRPC)

### syllabus router

```typescript
// apps/api/src/routers/syllabus.ts

syllabusRouter = router({
  // Upload & Processing
  getUploadUrl: protectedProcedure // Returns S3 presigned URL
    .input(z.object({ filename, examId, mimeType }))
    .mutation(),

  processUpload: protectedProcedure // Queues BullMQ processing job
    .input(z.object({ syllabusId }))
    .mutation(),

  getStatus: protectedProcedure // Polling endpoint for processing status
    .input(z.object({ syllabusId }))
    .query(),

  // Syllabus CRUD
  list: protectedProcedure // List syllabi for exam
    .input(z.object({ examId }))
    .query(),

  getTree: protectedProcedure // Full tree for a syllabus
    .input(z.object({ syllabusId }))
    .query(),

  getNode: protectedProcedure // Single node with children
    .input(z.object({ nodeId }))
    .query(),

  // Tutorial Generation
  generateTutorial: protectedProcedure
    .input(
      z.object({
        nodeId: z.string().uuid(),
        providers: z.array(aiProviderSchema).min(1),
        mode: z.enum(["single", "multi"]),
      }),
    )
    .mutation(),

  getTutorial: protectedProcedure.input(z.object({ nodeId })).query(),

  // MCQ Generation
  generateMCQs: protectedProcedure
    .input(
      z.object({
        nodeId: z.string().uuid(),
        tutorialId: z.string().uuid(),
        count: z.number().min(5).max(50).default(10),
        difficulty: z.enum(["mixed", "easy", "medium", "hard"]).default("mixed"),
        providers: z.array(aiProviderSchema).min(1),
      }),
    )
    .mutation(),

  getNodeQuestions: protectedProcedure.input(z.object({ nodeId })).query(),

  // Exam Assembly
  createExamFromNodes: protectedProcedure
    .input(
      z.object({
        nodeIds: z.array(z.string().uuid()).min(1),
        questionCount: z.number().min(5).max(200),
        timeLimitMinutes: z.number().min(5).max(300),
        difficultyMix: z
          .object({
            easy: z.number(),
            medium: z.number(),
            hard: z.number(),
          })
          .optional(),
      }),
    )
    .mutation(),
});
```

---

## 7. File Locations

| What              | Where                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Drizzle schemas   | `packages/shared/src/db/schema/syllabi.ts`, `syllabus-nodes.ts`, `tutorials.ts`, `tutorial-questions.ts` |
| Zod validators    | `packages/shared/src/validators/syllabus.ts`, `tutorial.ts`                                              |
| tRPC router       | `apps/api/src/routers/syllabus.ts`                                                                       |
| BullMQ worker     | `apps/api/src/workers/syllabus-processor.ts`                                                             |
| Multi-agent       | `apps/api/src/ai/multi-agent.ts`                                                                         |
| Prompts           | `apps/api/src/ai/prompts/syllabus-extraction.ts`, `tutorial-generation.ts`, `tutorial-to-mcq.ts`         |
| Upload page       | `apps/web/src/app/(dashboard)/syllabus/upload/page.tsx`                                                  |
| Tree viewer       | `apps/web/src/app/(dashboard)/syllabus/[id]/page.tsx`                                                    |
| Tutorial viewer   | `apps/web/src/app/(dashboard)/syllabus/[id]/tutorial/[nodeId]/page.tsx`                                  |
| Provider selector | `apps/web/src/components/ai-provider-selector.tsx`                                                       |
| Exam builder      | `apps/web/src/app/(dashboard)/syllabus/[id]/exam/page.tsx`                                               |

---

## 8. Implementation Order

1. **Database** — Schema + migration + validators (Claude Code)
2. **PDF Processing Worker** — Upload to S3, extract text, parse tree (Claude Code)
3. **Multi-Agent Module** — Fan-out, merge, validate (Claude Code)
4. **Tutorial Generation** — Prompts + tRPC endpoint (Claude Code)
5. **MCQ Generation** — From tutorial content (Claude Code)
6. **Provider Selector Component** — Reusable UI (Cursor)
7. **Upload UI** — Drag-drop + progress (Cursor)
8. **Tree Viewer UI** — Collapsible tree + status badges (Cursor)
9. **Tutorial Viewer UI** — Rich content display (Cursor)
10. **Exam Builder UI** — Node selection + config (Cursor)
11. **Integration Testing** — Full pipeline E2E (Claude Code)
