# Database Patterns (Drizzle + PostgreSQL)

## Schema Location
All schemas in `packages/shared/src/db/schema/`

## Required Columns (Every Table)
```typescript
id: uuid("id").defaultRandom().primaryKey(),
examId: uuid("exam_id").notNull().references(() => exams.id),
orgId: uuid("org_id").references(() => organizations.id),
createdAt: timestamp("created_at").defaultNow().notNull(),
updatedAt: timestamp("updated_at").defaultNow().notNull(),
```

## Question Schema Pattern
Use JSONB `content` column with discriminated union:
- type: "mcq" | "true_false" | "fill_blank" | "match" | "assertion"
- Each type has its own Zod schema in `packages/shared/src/validators/`

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
EVERY query touching user data must include `WHERE org_id = $orgId`. Use Drizzle's `.where(eq(table.orgId, ctx.orgId))` pattern.
