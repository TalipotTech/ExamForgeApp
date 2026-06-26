# Claude Code — AI Image Generation Implementation

> ## ⛔ MANDATORY SAFETY PROTOCOL — READ FIRST ⛔
>
> **This feature is ADDITIVE. It creates new files and adds new capability.
> It does NOT change how any existing feature works.**
>
> Before ANY file change:
>
> 1. `cat` the file to see its FULL current content
> 2. Identify exactly what you are ADDING
> 3. APPEND to index/export files — never rewrite them
> 4. After EVERY change: `pnpm type-check`
>
> **FORBIDDEN ACTIONS:**
>
> - ❌ Rewriting any existing schema, router, service, or worker
> - ❌ Changing the existing `ai-router.ts` (text AI) — image router is SEPARATE
> - ❌ Modifying existing function signatures
> - ❌ Rewriting any `index.ts` (only append)
> - ❌ Changing existing env var names
> - ❌ Touching the tutorial template HTML/CSS
>
> **This prompt works for BOTH ExamForge AND PadVik. The code is nearly
> identical — only the S3 bucket name, platform string, and image purposes
> differ. Build it in whichever repo you're in; note platform-specific
> values where marked [PLATFORM].**

---

## ★ AS-BUILT EXECUTION PLAN (v2) — FOLLOW THIS ORDER

> This supersedes the older step list further down where they differ. It is
> the plan that was actually shipped in ExamForge. Read **§0 of
> `AI_IMAGE_GENERATION.md`** first — it has the authoritative design and the
> full env list / file map. `[PLATFORM]`: ExamForge `platform='examforge'`,
> bucket `examforge-images`; PadVik `platform='padvik'`, bucket
> `padvik-images`. "syllabus node / topic" = PadVik's content-tree node.
>
> After **every** step: `pnpm type-check`. Each step ≈ one commit.

**STEP 1 — DB + env.** `image_generations` table (id, platform, purpose,
model, prompt, enhanced_prompt, negative_prompt, s3_key, cdn_url, width,
height, cost_usd, generation_time_ms, user_id FK, content_id uuid,
content_type, **syllabus_node_id bigint FK ON DELETE set null**, was_fallback,
fallback_model, user_rating, created_at). Add **topic-node columns** to the
content-tree node table (ExamForge `syllabus_nodes`): `image_url`,
`image_key`, `image_status` default `'none'`, `image_content_hash`. APPEND
schema exports. Generate + inspect migration (CREATE/ALTER only, **no DROP**)

- migrate. APPEND all env vars from §0.9 to `.env.example` + `.env.local`.

**STEP 2 — Providers (all `fetch`, no `openai` SDK).**
`ai/image-providers/types.ts` (`ImageProviderResult`, `MODEL_COSTS`,
`aspectRatioToDimensions`), then `openai-image.ts` (POST
`/v1/images/generations`, read `b64_json`), `google-image.ts` (Imagen
`:predict`), `ideogram-image.ts` (POST then fetch the returned URL bytes).

**STEP 3 — Prompt enhancer + storage.**
`ai/image-prompts/prompt-enhancer.ts` (`ImagePurpose`, `ImageStyle`,
`buildEnhancedPrompt`). `lib/s3.ts` (`uploadBufferToS3`).
`services/image-storage.ts` (local + s3 drivers, `IMAGE_STORAGE_DRIVER`).
Add Fastify route **`GET /api/images/*`** in `index.ts` rooted at
`IMAGE_STORAGE_DIR` (isolated from any existing `/api/files/*`).

**STEP 4 — Image router.** `ai/image-router.ts`: `generateImage(request, db)`
— `MODEL_ROUTING` per purpose, budget-aware downgrade (≥70% decorative→mini,
≥90% all→mini, ≥100% throw), enhance prompt, call provider with fallback,
**store via `getImageStorage()`**, log to `image_generations` (incl.
`syllabusNodeId`). Returns `{ url, cdnUrl, key, model, cost, … }`.

**STEP 5 — Context brief.** Add AI task **`derive_image_brief`** to
`ai/types.ts` + `ai-router.ts` map (**primary `openai`/`gpt-4o`, fallback
`anthropic`**) + `taskToFeature` (`"image"`).
`ai/image-prompts/image-brief.ts`: `deriveImageBrief(input, db)` →
`routeAIRequest` with the `{needsImage,visualType,brief,labels}` Zod schema,
wrapped in **`Promise.race` with `IMAGE_BRIEF_TIMEOUT_MS`** and a
**deterministic fallback** brief on any failure; pick `purpose`/`style` in
code from `visualType` + keyword hints.

**STEP 6 — Topic sync service + worker.**
`services/topic-image-sync.ts`:
`syncTopicImage({syllabusNodeId,userId,force,examName?,additionalPrompt?,aspectRatio?,size?,purposeOverride?,styleOverride?}, db)`
— load node + exam + current tutorial text, compute
`sha256(title|desc|keyTerms|tutorialText | additionalPrompt | overrideKey)`,
**skip if hash unchanged**, derive brief (pass `additionalPrompt`; an explicit
additional prompt also forces `needsImage`), skip if `!needsImage`, else
`generateImage` (apply `purposeOverride`/`styleOverride`/`aspectRatio`/`size`,
defaulting to content-derived purpose/style + 16:9 + standard) and persist
`image_url`/`image_key`/`image_status='ready'`/`image_content_hash`. Each call
inserts a new `image_generations` row, so a topic accumulates multiple images.
`queues/image-sync-queue.ts` + `workers/image-sync-worker.ts` (whole-syllabus
batch, eligible = non unit/root, per-topic non-fatal, **break on budget
error**); register the worker in `workers/index.ts`.

**STEP 7 — tRPC router.** `trpc/routers/image-generation.ts` with: `generate`,
`getStats`, `getHistory`, **`listImages`** (search + pagination; left-join the
topic node for its title; derive provider from model; return full metadata),
**`listTopicImages`** (all images for one node), `listSyllabi`, `listTopics`
(also return **`hasTutorial`** per node), `syncTopic` (inline single topic via
the service; accept `additionalPrompt` + optional `aspectRatio`/`size`/
`purpose`/`style`), `syncSyllabus` (enqueue), `getSyncStatus`. Register in
`trpc/index.ts`.

**STEP 8 — Image viewer.** `components/image-lightbox.tsx` — full-screen
overlay: zoom (buttons + wheel, 25–600%), rotate ±90°, **drag-to-pan when
zoomed** (pointer capture, 1:1 screen-space, re-center on zoom-out, don't
close on drag-end), reset, close (X/Esc/backdrop). Controlled via
`{open, src, alt, caption, onClose}`. Do NOT add an eslint-disable for a rule
the repo doesn't define (it errors the build).

**STEP 9 — Admin page + nav.** Dedicated `app/(dashboard)/admin/images/page.tsx`
with **Tabs** (Single image / Topic sync / Usage & cost) + a **Help dialog**.
Components:

- `image-gen-test-panel` (manual generate).
- `image-gen-gallery` (**Generated Images** via `listImages`): **Grid/Table
  toggle**, **search box**, **pagination**, full metadata per row incl. the
  **prompt**; click opens the lightbox.
- `image-sync-panel` (syllabus + topic pickers + whole-syllabus toggle +
  force). On topic select: show **existing images on that topic**
  (`listTopicImages`, with metadata), an **additional-prompt** textarea, and an
  **overrides** row (purpose/aspect/size/style, default _Auto_). Make
  single-topic generation **resilient**: record the topic's image count, poll
  `listTopicImages` while generating, treat transport/non-JSON errors as
  non-fatal (the proxy may drop the long response), clear on new image or a
  2-min safety timeout; flag topics where `!hasTutorial` ("no reader page").
- `image-gen-stats`.
  Add an **"Image Gen" nav item below "Learn"** in the dashboard layout
  (admin-only). Resolve relative `/api/images/*` URLs with `NEXT_PUBLIC_API_URL`.

**STEP 10 — Reader images.** Have the content reader's tutorial query return an
**`images[]`** array, resolved as **self → nearest ancestor with images**
(section nodes have no page of their own), each `{ id, cdnUrl, prompt }`. Render
**all** of them as clickable figures above the content, each with its **full
prompt as a caption** (opens the lightbox). A leaf's own images take precedence
over an ancestor's.

**STEP 11 — Verify.** `pnpm type-check && pnpm lint && pnpm build`. Update
`CLAUDE.md`. Optional: gated `enrichWithDiagram` tutorial hook +
`// TODO: image-gen` markers at future hook points (marketplace cover,
creator thumbnail, doubt visualization, pattern chart).

> The detailed code blocks in the sections below are still a useful
> reference for STEP 1–4 and 7, but apply the **as-built deltas in §0.1**
> (db-as-param, fetch-based OpenAI, storage abstraction) over them.

---

## MEMORY CONTEXT

**Read these before starting:**

```bash
cat CLAUDE.md
cat apps/api/src/ai/ai-router.ts              # how AI clients are initialized + error handling
cat packages/shared/src/db/schema/index.ts    # current schema exports
cat apps/api/src/routers/index.ts             # current router exports
cat .env.example                              # current env vars
ls apps/api/src/ai/                           # existing AI structure
ls apps/api/src/ai/prompts/                   # existing prompt files
```

### Existing AI Infrastructure (reuse, don't duplicate)

```
apps/api/src/ai/
├── ai-router.ts          — TEXT AI routing (Claude/Gemini/OpenAI/Mistral)
│                           DO NOT modify. Image router is a SEPARATE file.
├── multi-agent.ts        — multi-provider fan-out
└── prompts/              — existing text prompts

Existing pattern to MATCH:
- API clients initialized at module top with env keys
- All calls wrapped in try/catch with fallback
- Usage logged to ai_usage_logs table
- Costs tracked per call
```

### Existing S3 Setup (reuse the helper if it exists)

```bash
# Check if an S3 upload helper already exists
grep -rl "PutObjectCommand\|uploadToS3\|s3Client" apps/api/src/ | head -5
```

If an S3 helper exists (e.g., in `apps/api/src/lib/s3.ts` or used by
tutorial-html-generator.ts or pdf-processor.ts), REUSE it. Do not create
a duplicate S3 client.

### Platform-Specific Values

```
[PLATFORM] values to set correctly:
  ExamForge:  S3 bucket = 'examforge-images', platform = 'examforge'
  PadVik:     S3 bucket = 'padvik-images',    platform = 'padvik'

Image purposes differ slightly per platform (see spec section 2).
Include ALL purposes in the enum — unused ones are harmless.
```

Full spec: `@docs/features/AI_IMAGE_GENERATION.md`

---

## EXECUTE IN ORDER — Each step = one commit

### STEP 1: Database table + env vars

`commit: feat(db): add image_generations tracking table`

**1A.** Create `packages/shared/src/db/schema/image-generations.ts`.

First read an existing schema file to match the style:

```bash
cat packages/shared/src/db/schema/ai-usage-logs.ts
```

Create the table (match the import style and column definition style exactly):

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  real,
  smallint,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const imageGenerations = pgTable(
  "image_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: varchar("platform", { length: 20 }).notNull(), // examforge | padvik
    purpose: varchar("purpose", { length: 50 }).notNull(),
    model: varchar("model", { length: 50 }).notNull(),

    prompt: text("prompt").notNull(),
    enhancedPrompt: text("enhanced_prompt"),
    negativePrompt: text("negative_prompt"),

    s3Key: varchar("s3_key", { length: 500 }).notNull(),
    cdnUrl: varchar("cdn_url", { length: 1000 }),
    width: integer("width"),
    height: integer("height"),

    costUsd: real("cost_usd").notNull(),
    generationTimeMs: integer("generation_time_ms"),

    userId: uuid("user_id").references(() => users.id),
    contentId: uuid("content_id"),
    contentType: varchar("content_type", { length: 50 }),

    wasFallback: boolean("was_fallback").default(false),
    fallbackModel: varchar("fallback_model", { length: 50 }),
    userRating: smallint("user_rating"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    platformIdx: index("idx_image_gen_platform").on(table.platform),
    purposeIdx: index("idx_image_gen_purpose").on(table.purpose),
    contentIdx: index("idx_image_gen_content").on(table.contentId),
  }),
);
```

**1B.** APPEND export to `packages/shared/src/db/schema/index.ts`:

```bash
cat packages/shared/src/db/schema/index.ts   # see current exports
```

Add at the bottom (do not touch existing lines):

```typescript
export * from "./image-generations";
```

**1C.** Generate and inspect migration:

```bash
pnpm db:generate
# READ the generated migration file:
cat packages/shared/drizzle/migrations/*_*.sql | tail -40
# It MUST be CREATE TABLE image_generations. NO DROP statements.
pnpm db:migrate
pnpm type-check
```

**1D.** APPEND env vars to `.env.example` (and `.env.local`):

```bash
cat .env.example   # check what's there
```

Add at the bottom:

```bash
# AI Image Generation
GOOGLE_AI_API_KEY=                          # for Imagen 4
IDEOGRAM_API_KEY=                           # for Ideogram 3.0 (text-heavy images)
IMAGE_S3_BUCKET=examforge-images            # [PLATFORM] set per repo
IMAGE_CLOUDFRONT_DOMAIN=
IMAGE_DEFAULT_QUALITY=standard
IMAGE_MONTHLY_BUDGET_USD=100
# Note: OPENAI_API_KEY already exists (reused for GPT Image)
```

---

### STEP 2: Provider implementations

`commit: feat(ai): add image generation providers (OpenAI, Google, Ideogram)`

**Read first to match client init pattern:**

```bash
cat apps/api/src/ai/ai-router.ts
```

**2A.** Create `apps/api/src/ai/image-providers/types.ts`:

```typescript
export interface ImageProviderResult {
  imageData: Buffer;
  cost: number;
  width: number;
  height: number;
}

export const MODEL_COSTS: Record<string, number> = {
  "gpt-image-1.5": 0.04,
  "gpt-image-1": 0.02,
  "gpt-image-1-mini": 0.005,
  "imagen-4-fast": 0.02,
  "imagen-4-standard": 0.04,
  "imagen-4-ultra": 0.06,
  "ideogram-3.0": 0.03,
};
```

**2B.** Create `apps/api/src/ai/image-providers/openai-image.ts`:

```typescript
import OpenAI from "openai";
import type { ImageProviderResult } from "./types";
import { MODEL_COSTS } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateWithOpenAI(params: {
  model: "gpt-image-1.5" | "gpt-image-1" | "gpt-image-1-mini";
  prompt: string;
  size: string; // "1024x1024" | "1536x1024" | "1024x1536"
  quality: "low" | "medium" | "high";
}): Promise<ImageProviderResult> {
  const response = await openai.images.generate({
    model: params.model,
    prompt: params.prompt,
    n: 1,
    size: params.size as any,
    quality: params.quality as any,
  });

  const b64 = response.data[0].b64_json;
  if (!b64) throw new Error("OpenAI returned no image data");

  const [width, height] = params.size.split("x").map(Number);
  return {
    imageData: Buffer.from(b64, "base64"),
    cost: MODEL_COSTS[params.model],
    width,
    height,
  };
}
```

**2C.** Create `apps/api/src/ai/image-providers/google-image.ts`:

```typescript
import type { ImageProviderResult } from "./types";
import { MODEL_COSTS } from "./types";

export async function generateWithGoogle(params: {
  model: "imagen-4-fast" | "imagen-4-standard" | "imagen-4-ultra";
  prompt: string;
  aspectRatio: string; // "1:1" | "16:9" | "9:16" | "4:3" | "3:4"
}): Promise<ImageProviderResult> {
  const modelId =
    params.model === "imagen-4-fast"
      ? "imagen-4.0-fast-generate-001"
      : params.model === "imagen-4-ultra"
        ? "imagen-4.0-ultra-generate-001"
        : "imagen-4.0-generate-001";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict?key=${process.env.GOOGLE_AI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: params.prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: params.aspectRatio,
          safetyFilterLevel: "block_only_high",
          personGeneration: "allow_adult",
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Imagen error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("Google returned no image data");

  const dims = aspectRatioToDimensions(params.aspectRatio);
  return {
    imageData: Buffer.from(b64, "base64"),
    cost: MODEL_COSTS[params.model],
    ...dims,
  };
}

function aspectRatioToDimensions(ar: string): { width: number; height: number } {
  const map: Record<string, { width: number; height: number }> = {
    "1:1": { width: 1024, height: 1024 },
    "16:9": { width: 1408, height: 768 },
    "9:16": { width: 768, height: 1408 },
    "4:3": { width: 1280, height: 896 },
    "3:4": { width: 896, height: 1280 },
  };
  return map[ar] || map["1:1"];
}
```

**2D.** Create `apps/api/src/ai/image-providers/ideogram-image.ts`:

```typescript
import type { ImageProviderResult } from "./types";
import { MODEL_COSTS } from "./types";

export async function generateWithIdeogram(params: {
  prompt: string;
  aspectRatio: string;
  style: string;
}): Promise<ImageProviderResult> {
  const arMap: Record<string, string> = {
    "1:1": "ASPECT_1_1",
    "16:9": "ASPECT_16_9",
    "9:16": "ASPECT_9_16",
    "4:3": "ASPECT_4_3",
    "3:4": "ASPECT_3_4",
  };

  const response = await fetch("https://api.ideogram.ai/generate", {
    method: "POST",
    headers: {
      "Api-Key": process.env.IDEOGRAM_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_request: {
        prompt: params.prompt,
        aspect_ratio: arMap[params.aspectRatio] || "ASPECT_1_1",
        model: "V_3",
        magic_prompt_option: "AUTO",
        style_type: params.style === "realistic" ? "REALISTIC" : "DESIGN",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ideogram error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const imageUrl = data.data?.[0]?.url;
  if (!imageUrl) throw new Error("Ideogram returned no image URL");

  // Ideogram returns a URL — fetch the actual image bytes
  const imgResponse = await fetch(imageUrl);
  const imageData = Buffer.from(await imgResponse.arrayBuffer());

  const dims = {
    "1:1": [1024, 1024],
    "16:9": [1408, 768],
    "9:16": [768, 1408],
    "4:3": [1280, 960],
    "3:4": [960, 1280],
  }[params.aspectRatio] || [1024, 1024];

  return {
    imageData,
    cost: MODEL_COSTS["ideogram-3.0"],
    width: dims[0],
    height: dims[1],
  };
}
```

---

### STEP 3: Prompt enhancer

`commit: feat(ai): add purpose-based prompt enhancement`

Create `apps/api/src/ai/image-prompts/prompt-enhancer.ts`.

Use the full `buildEnhancedPrompt()` function from spec section 4.
It takes the purpose + platform + style and wraps the user's raw prompt
with quality and context instructions.

Also create the purpose type:

```typescript
export type ImagePurpose =
  | "tutorial_diagram"
  | "formula_card"
  | "comparison_infographic"
  | "pattern_chart"
  | "topic_thumbnail"
  | "exam_cover"
  | "marketplace_cover"
  | "creator_banner"
  | "social_media"
  | "chapter_illustration"
  | "math_visualization"
  | "science_diagram"
  | "history_infographic"
  | "chapter_thumbnail"
  | "board_icon"
  | "worksheet_header"
  | "classroom_banner"
  | "doubt_visualization"
  | "placeholder"
  | "custom";
```

---

### STEP 4: Image router (the core)

`commit: feat(ai): add multi-model image router with budget controls`

Create `apps/api/src/ai/image-router.ts`.

This is the main entry point. It:

1. Maps purpose → model (MODEL_ROUTING from spec section 3.2)
2. Applies budget-aware downgrade (spec section 8)
3. Enhances the prompt
4. Calls the right provider (with fallback on error)
5. Uploads to S3 (REUSE existing S3 helper — check first)
6. Logs to image_generations table
7. Returns the result

```typescript
import { generateWithOpenAI } from "./image-providers/openai-image";
import { generateWithGoogle } from "./image-providers/google-image";
import { generateWithIdeogram } from "./image-providers/ideogram-image";
import { buildEnhancedPrompt, type ImagePurpose } from "./image-prompts/prompt-enhancer";
import { db, imageGenerations } from "@examforge/shared"; // adjust import
import { gte, sql } from "drizzle-orm";
// IMPORT the existing S3 helper — find it first with grep, don't create new

interface ModelConfig {
  model: string;
  fallback: string | null;
  cost: number;
}

const MODEL_ROUTING: Record<ImagePurpose, ModelConfig> = {
  tutorial_diagram: { model: "gpt-image-1.5", fallback: "imagen-4-standard", cost: 0.04 },
  chapter_illustration: { model: "gpt-image-1.5", fallback: "imagen-4-standard", cost: 0.04 },
  science_diagram: { model: "gpt-image-1.5", fallback: "imagen-4-standard", cost: 0.04 },
  doubt_visualization: { model: "gpt-image-1.5", fallback: "imagen-4-standard", cost: 0.04 },
  formula_card: { model: "ideogram-3.0", fallback: "gpt-image-1.5", cost: 0.03 },
  comparison_infographic: { model: "ideogram-3.0", fallback: "gpt-image-1.5", cost: 0.03 },
  math_visualization: { model: "ideogram-3.0", fallback: "gpt-image-1.5", cost: 0.03 },
  pattern_chart: { model: "ideogram-3.0", fallback: "gpt-image-1.5", cost: 0.03 },
  history_infographic: { model: "ideogram-3.0", fallback: "gpt-image-1.5", cost: 0.03 },
  worksheet_header: { model: "ideogram-3.0", fallback: "imagen-4-fast", cost: 0.03 },
  topic_thumbnail: { model: "imagen-4-fast", fallback: "gpt-image-1-mini", cost: 0.02 },
  exam_cover: { model: "imagen-4-fast", fallback: "gpt-image-1-mini", cost: 0.02 },
  chapter_thumbnail: { model: "imagen-4-fast", fallback: "gpt-image-1-mini", cost: 0.02 },
  board_icon: { model: "imagen-4-fast", fallback: "gpt-image-1-mini", cost: 0.02 },
  creator_banner: { model: "imagen-4-fast", fallback: "gpt-image-1-mini", cost: 0.02 },
  classroom_banner: { model: "imagen-4-fast", fallback: "gpt-image-1-mini", cost: 0.02 },
  marketplace_cover: { model: "imagen-4-standard", fallback: "gpt-image-1.5", cost: 0.04 },
  social_media: { model: "gpt-image-1.5", fallback: "imagen-4-standard", cost: 0.04 },
  placeholder: { model: "gpt-image-1-mini", fallback: "imagen-4-fast", cost: 0.005 },
  custom: { model: "gpt-image-1.5", fallback: "imagen-4-standard", cost: 0.04 },
};

export interface ImageGenerationRequest {
  purpose: ImagePurpose;
  prompt: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  size?: "small" | "standard" | "hd";
  style?: "realistic" | "illustration" | "diagram" | "flat" | "watercolor";
  forceModel?: string;
  platform: "examforge" | "padvik";
  userId?: string;
  contentId?: string;
  contentType?: string;
}

export interface ImageGenerationResult {
  url: string;
  cdnUrl: string;
  model: string;
  cost: number;
  generationTimeMs: number;
  width: number;
  height: number;
}

export async function generateImage(
  request: ImageGenerationRequest,
): Promise<ImageGenerationResult> {
  const startTime = Date.now();

  // Budget check + downgrade
  const config = await getBudgetAwareModel(request.purpose, request.forceModel);

  // Enhance prompt
  const enhancedPrompt = buildEnhancedPrompt({
    purpose: request.purpose,
    prompt: request.prompt,
    platform: request.platform,
    style: request.style,
  });

  const aspectRatio = request.aspectRatio || "1:1";

  // Generate with fallback
  let result;
  let usedModel = config.model;
  let wasFallback = false;

  try {
    result = await callProvider(config.model, enhancedPrompt, aspectRatio, request);
  } catch (error) {
    console.warn(
      `Image gen failed with ${config.model}: ${error}. Trying fallback ${config.fallback}`,
    );
    if (!config.fallback) throw error;
    result = await callProvider(config.fallback, enhancedPrompt, aspectRatio, request);
    usedModel = config.fallback;
    wasFallback = true;
  }

  // Upload to S3 (REUSE existing helper)
  const bucket = process.env.IMAGE_S3_BUCKET!;
  const s3Key = `generated-images/${request.platform}/${request.purpose}/${Date.now()}-${crypto.randomUUID()}.png`;
  await uploadToS3(bucket, s3Key, result.imageData, "image/png"); // existing helper
  const cdnUrl = `https://${process.env.IMAGE_CLOUDFRONT_DOMAIN}/${s3Key}`;

  // Log
  await db.insert(imageGenerations).values({
    platform: request.platform,
    purpose: request.purpose,
    model: usedModel,
    prompt: request.prompt,
    enhancedPrompt,
    s3Key,
    cdnUrl,
    width: result.width,
    height: result.height,
    costUsd: result.cost,
    generationTimeMs: Date.now() - startTime,
    userId: request.userId,
    contentId: request.contentId,
    contentType: request.contentType,
    wasFallback,
    fallbackModel: wasFallback ? usedModel : null,
  });

  return {
    url: `https://${bucket}.s3.amazonaws.com/${s3Key}`,
    cdnUrl,
    model: usedModel,
    cost: result.cost,
    generationTimeMs: Date.now() - startTime,
    width: result.width,
    height: result.height,
  };
}

async function callProvider(
  model: string,
  prompt: string,
  aspectRatio: string,
  request: ImageGenerationRequest,
) {
  const quality = request.size === "hd" ? "high" : request.size === "small" ? "low" : "medium";

  if (model.startsWith("gpt-image")) {
    const size =
      aspectRatio === "16:9" ? "1536x1024" : aspectRatio === "9:16" ? "1024x1536" : "1024x1024";
    return generateWithOpenAI({ model: model as any, prompt, size, quality });
  }
  if (model.startsWith("imagen")) {
    return generateWithGoogle({ model: model as any, prompt, aspectRatio });
  }
  if (model.startsWith("ideogram")) {
    return generateWithIdeogram({ prompt, aspectRatio, style: request.style || "illustration" });
  }
  throw new Error(`Unknown image model: ${model}`);
}

async function getBudgetAwareModel(
  purpose: ImagePurpose,
  forceModel?: string,
): Promise<ModelConfig> {
  if (forceModel) return { model: forceModel, fallback: null, cost: 0.04 };

  const config = MODEL_ROUTING[purpose];
  const budget = parseFloat(process.env.IMAGE_MONTHLY_BUDGET_USD || "100");

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const spent = await db
    .select({ total: sql<number>`COALESCE(SUM(cost_usd), 0)` })
    .from(imageGenerations)
    .where(gte(imageGenerations.createdAt, startOfMonth));
  const usage = (spent[0]?.total || 0) / budget;

  if (usage >= 1.0) throw new Error("Monthly image generation budget exceeded");
  if (usage >= 0.9) return { model: "gpt-image-1-mini", fallback: null, cost: 0.005 };
  if (usage >= 0.7) {
    const decorative = [
      "topic_thumbnail",
      "exam_cover",
      "chapter_thumbnail",
      "board_icon",
      "creator_banner",
      "classroom_banner",
    ];
    if (decorative.includes(purpose))
      return { model: "gpt-image-1-mini", fallback: null, cost: 0.005 };
  }
  return config;
}
```

**IMPORTANT:** Replace `uploadToS3` with the EXACT existing S3 helper found
via grep in the memory context step. If no helper exists, create
`apps/api/src/lib/s3.ts` with a minimal upload function using the AWS SDK
that's already a dependency (check package.json first).

---

### STEP 5: tRPC router

`commit: feat(api): add image generation tRPC endpoints`

Create `apps/api/src/routers/image-generation.ts`. Match the pattern of an
existing router:

```bash
cat apps/api/src/routers/exam.ts   # or any existing router
```

```typescript
export const imageGenerationRouter = router({
  generate: protectedProcedure
    .input(
      z.object({
        purpose: z.enum([
          /* all ImagePurpose values */
        ]),
        prompt: z.string().min(5).max(1000),
        aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).default("1:1"),
        size: z.enum(["small", "standard", "hd"]).default("standard"),
        style: z
          .enum(["realistic", "illustration", "diagram", "flat", "watercolor"])
          .default("illustration"),
        contentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return generateImage({
        ...input,
        platform: "examforge", // [PLATFORM] set correctly per repo
        userId: ctx.user.id,
      });
    }),

  getStats: adminProcedure.query(async () => {
    // Monthly aggregates: total count, total cost, by model, by purpose, fallback rate
  }),

  getHistory: protectedProcedure
    .input(z.object({ contentId: z.string().uuid().optional(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      // Query image_generations with filters
    }),
});
```

APPEND to `apps/api/src/routers/index.ts`:

```typescript
import { imageGenerationRouter } from "./image-generation";
// In appRouter: imageGeneration: imageGenerationRouter,
```

---

### STEP 6: Integration hook — Tutorial Agent (ExamForge only)

`commit: feat(integration): add diagram generation to tutorial agent`

**ExamForge only.** Open the tutorial agent worker:

```bash
cat apps/api/src/workers/tutorial-agent-worker.ts
```

Find where the tutorial HTML fragment is generated. ADD a new helper function
(do NOT restructure the worker) that, after the HTML is generated, checks if
the topic needs a diagram and generates one:

```typescript
// NEW function — add at the bottom of the file
async function enrichWithDiagram(
  html: string,
  node: SyllabusNode,
  examName: string,
): Promise<string> {
  // Only generate if the topic is diagram-worthy (heuristic or AI flag)
  if (!shouldGenerateDiagram(node)) return html;

  try {
    const image = await generateImage({
      purpose: "tutorial_diagram",
      prompt: `${node.title} for ${examName}. ${node.description || ""}`,
      aspectRatio: "16:9",
      style: "diagram",
      platform: "examforge",
      contentId: node.id,
      contentType: "tutorial",
    });
    // Inject after the first <h2> in the HTML
    const diagramHtml = `<div class="diagram"><img src="${image.cdnUrl}" alt="${node.title}" loading="lazy" /><figcaption>Fig: ${node.title}</figcaption></div>`;
    return html.replace(/(<\/h2>)/, `$1\n${diagramHtml}`);
  } catch (e) {
    console.warn(`Diagram generation skipped for ${node.title}: ${e}`);
    return html; // gracefully continue without diagram
  }
}
```

Call this function where the HTML is assembled. **One line addition.**
If generation fails, the tutorial still works without the diagram.

---

### STEP 7: Admin stats component

`commit: feat(ui): add image generation stats to admin dashboard`

Check existing UI components:

```bash
ls apps/web/src/components/ui/
ls apps/web/src/components/admin/ 2>/dev/null
```

Create `apps/web/src/components/admin/image-gen-stats.tsx`.
Fetch `trpc.imageGeneration.getStats.useQuery()`. Display the monthly
summary (count, cost bar, by-model, by-purpose, fallback rate) using
only shadcn components that already exist.

Add this component to the existing admin settings page (APPEND a section,
do not rewrite the page):

```bash
cat apps/web/src/app/\(dashboard\)/admin/settings/page.tsx
```

---

### STEP 8: Verify

`commit: chore: verify image generation pipeline`

```bash
pnpm type-check
pnpm lint:fix
pnpm build

# Verify the table exists, others untouched
pnpm db:studio

# Verify existing features unaffected
pnpm dev
# → Login → dashboard loads → existing AI features work → admin loads
```

Update docs (APPEND only):

- `CLAUDE.md` — add image_generations table, image-router.ts to AI section
- `.env.example` — already done in step 1
- `BACKLOG.md` — check off image generation tasks

---

## INTEGRATION HOOKS FOR LATER (add TODO comments, don't build now)

These are future integration points. Add a `// TODO: image-gen` comment
at each location so they're easy to find when those features ship:

```
1. Marketplace listing creation → auto-generate cover (purpose: marketplace_cover)
2. Creator content upload → auto-generate thumbnail (purpose: topic_thumbnail / chapter_thumbnail)
3. Doubt AI response → generate diagram when needed (purpose: doubt_visualization)
4. Exam pattern analysis → generate pattern chart (purpose: pattern_chart)
5. PadVik chapter pipeline → generate illustrations (purpose: chapter_illustration)
```

Do NOT build these now — just mark the locations. Each gets built when
its parent feature is implemented.

---

## SELF-CHECK BEFORE DECLARING DONE

```bash
# Only the files this prompt created/modified should appear:
git diff --name-only

# Expected NEW files:
#   packages/shared/src/db/schema/image-generations.ts
#   apps/api/src/ai/image-providers/types.ts
#   apps/api/src/ai/image-providers/openai-image.ts
#   apps/api/src/ai/image-providers/google-image.ts
#   apps/api/src/ai/image-providers/ideogram-image.ts
#   apps/api/src/ai/image-prompts/prompt-enhancer.ts
#   apps/api/src/ai/image-router.ts
#   apps/api/src/routers/image-generation.ts
#   apps/web/src/components/admin/image-gen-stats.tsx
#   (maybe) apps/api/src/lib/s3.ts

# Expected MODIFIED files (append-only):
#   packages/shared/src/db/schema/index.ts  (one new export line)
#   apps/api/src/routers/index.ts            (one import + one router line)
#   apps/api/src/workers/tutorial-agent-worker.ts  (one new function + one call)
#   apps/web/src/app/(dashboard)/admin/settings/page.tsx  (one new section)
#   .env.example                             (new vars at bottom)
#   CLAUDE.md, BACKLOG.md                    (doc updates)

# Nothing else should change. If git diff shows other files, REVERT them.
```
