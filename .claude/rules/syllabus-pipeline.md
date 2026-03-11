# Syllabus Intelligence Pipeline Rules

## Feature Context

PDF syllabus → AI extraction → structured tree → multi-agent tutorials → MCQs → exams.
Full spec: @docs/features/SYLLABUS_PIPELINE.md

## Key Files

- Schema: `packages/shared/src/db/schema/syllabi.ts`, `syllabus-nodes.ts`, `tutorials.ts`, `tutorial-questions.ts`
- Validators: `packages/shared/src/validators/syllabus.ts`, `tutorial.ts`
- Router: `apps/api/src/routers/syllabus.ts`
- Worker: `apps/api/src/workers/syllabus-processor.ts`
- Multi-agent: `apps/api/src/ai/multi-agent.ts`
- Prompts: `apps/api/src/ai/prompts/syllabus-extraction.ts`, `tutorial-generation.ts`, `tutorial-to-mcq.ts`

## syllabus_nodes Table — Tree Structure

Uses adjacency list pattern (parent_id self-reference).

- depth 0 = syllabus root
- depth 1 = unit/module
- depth 2 = chapter/section
- depth 3 = topic
- depth 4 = subtopic/definition/formula
  Always order by `sort_order` to preserve syllabus ordering.
  Query full tree: recursive CTE or fetch all + build tree in app code.

## Multi-Agent Pattern

```typescript
// Single provider
if (providers.length === 1) → route through ai-router.ts

// Multi-agent
if (providers.length > 1) {
  const results = await Promise.allSettled(
    providers.map(p => callProvider(p, prompt, schema))
  );
  const valid = results.filter(r => r.status === 'fulfilled');
  const merged = await mergeResults(valid, strategy);
  return merged;
}
```

## Tutorial Content — ALWAYS structured JSONB

Never store tutorials as plain text blobs. Use the TutorialContent
interface with typed sections, learning objectives, definitions, formulas.
The `content_text` column stores a plain-text version for search + MCQ generation.

## MCQ Generation — FROM tutorial content

MCQs must be generated from the tutorial text, not just the topic name.
This ensures questions are answerable from the study material.
Always pass `tutorial.content_text` as context in the MCQ generation prompt.

## Provider Attribution

When multi-agent mode is used, track which provider contributed what:

- `tutorials.providers_used`: array of provider IDs
- Each section in tutorial content has an optional `provider` field
- `ai_usage_logs`: one entry per provider per call
