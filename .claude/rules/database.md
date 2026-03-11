# Database Patterns (Drizzle + PostgreSQL)

## Schema Location

All schemas in `packages/shared/src/db/schema/`

## Current Tables (8 — live)

organizations, users, exams, questions, question_versions,
exam_sessions, scrape_sources, ai_usage_logs

## Planned Tables (4 — syllabus pipeline)

syllabi, syllabus_nodes, tutorials, tutorial_questions

## Required Columns (Every Table)

```typescript
id: uuid("id").defaultRandom().primaryKey(),
createdAt: timestamp("created_at").defaultNow().notNull(),
updatedAt: timestamp("updated_at").defaultNow().notNull(),
```

Plus `exam_id` FK where applicable, `org_id` for multi-tenancy.

## Question Schema Pattern

Use JSONB `content` column with discriminated union:

- type: "mcq" | "true_false" | "fill_blank" | "match" | "assertion"
- Each type has its own Zod schema in `packages/shared/src/validators/`

## Tree Structure Pattern (syllabus_nodes)

Adjacency list with self-referencing FK:

```typescript
parentId: uuid("parent_id").references(() => syllabusNodes.id, { onDelete: "cascade" }),
depth: integer("depth").notNull().default(0),
sortOrder: integer("sort_order").notNull().default(0),
```

Query: fetch all nodes for a syllabus, build tree in app code.
Or use recursive CTE: `WITH RECURSIVE tree AS (...)`

## Tutorial Content — Structured JSONB

```typescript
content: jsonb("content").$type<TutorialContent>().notNull(),
contentText: text("content_text").notNull(), // Plain text for search + MCQ gen
```

Never store tutorials as unstructured text blobs.

## Tutorial Versioning

```typescript
version: integer("version").notNull().default(1),
isCurrent: boolean("is_current").default(true),
```

On re-generate: set old version `is_current = false`, create new row.
Query current: `WHERE syllabus_node_id = $id AND is_current = true`

## Junction Table Pattern (tutorial_questions)

Links tutorials → questions → syllabus_nodes.
Enables: "show all MCQs for this syllabus node" queries.

## Multilingual Storage

```typescript
translations: jsonb("translations").$type<{
  hi?: { question: string; options: string[]; explanation: string };
  ta?: { question: string; options: string[]; explanation: string };
  ml?: { question: string; options: string[]; explanation: string };
}>(),
```

## Vector Embeddings

```typescript
embedding: vector("embedding", { dimensions: 1536 }),
```

Create HNSW index: `CREATE INDEX ON questions USING hnsw (embedding vector_cosine_ops)`

## Multi-tenancy

EVERY query touching user data must include `WHERE org_id = $orgId`.
Use Drizzle's `.where(eq(table.orgId, ctx.orgId))` pattern.
