# Feature: AI Image Generation — Multi-Model Routing for ExamForge & PadVik

> **Shared feature:** Both platforms use the same image generation service
> **Branch:** `feat/image-generation`
> **Principle:** Route to the best model per task, not one model for everything
> **Cost target:** <$80/month for 5,000 images across both platforms

---

## 0. AS-BUILT (v2) — AUTHORITATIVE. READ THIS FIRST.

> This section reflects what was **actually implemented and shipped in
> ExamForge**. Where it differs from the older sections below, **this wins**.
> The PadVik implementation should mirror this. `[PLATFORM]`-marked values
> differ: ExamForge → `platform='examforge'`, bucket `examforge-images`;
> PadVik → `platform='padvik'`, bucket `padvik-images`.
>
> **Topic mapping:** ExamForge attaches images to `syllabus_nodes` (its
> topic tree, `id` = `bigint`). In PadVik, attach to the equivalent
> per-topic/per-chapter content node table. Wherever this doc says
> "syllabus node / topic", read it as PadVik's content-tree node.

### 0.1 Key deviations from the original spec (do these, not the old text)

1. **`db` is passed as a parameter** to `generateImage(request, db)` and to
   every service/worker — there is **no global `db` import**. Matches the
   text `ai-router.ts` convention (`routeAIRequest(params, db)`).
2. **No `openai` SDK package.** OpenAI image generation is a **direct
   `fetch`** to `https://api.openai.com/v1/images/generations` (gpt-image-\*
   returns `b64_json` by default). Google Imagen and Ideogram are also
   plain `fetch`. Do not add the `openai` dependency.
3. **Pluggable storage, S3 is optional.** Generated images go through a
   storage abstraction (`services/image-storage.ts`) with two drivers:
   - `local` (default): writes binary to `IMAGE_STORAGE_DIR`
     (default `<cwd>/storage/images`), served by a dedicated Fastify route
     `GET /api/images/*`. Works on a **Railway Volume** — set
     `IMAGE_STORAGE_DIR` to the mounted volume path (e.g. `/data/images`).
   - `s3`: uses `lib/s3.ts` (`@aws-sdk/client-s3`, already a dep). Also
     **Cloudflare R2-compatible** (S3 API) — flip later with zero code
     change by setting `IMAGE_STORAGE_DRIVER=s3` + `IMAGE_S3_BUCKET`.
   - Driver auto-selects: `s3` if `IMAGE_S3_BUCKET` set, else `local`.
     `image_generations.s3_key` stores the storage key for either driver;
     `cdn_url` stores the public URL the provider returns.
4. **Routers live under `apps/api/src/trpc/routers/`** and register in
   `apps/api/src/trpc/index.ts` (named-export pattern).

### 0.2 Context-derived briefs (NEW — the core "smart" feature)

Admins do **not** hand-write prompts for topic images. `deriveImageBrief`
(`ai/image-prompts/image-brief.ts`) reads a topic's **own content** —
title + description + key terms + the generated tutorial/plain text +
exam/audience — and returns structured JSON:
`{ needsImage: boolean, visualType, brief, labels[] }`.

- AI task **`derive_image_brief`** added to `ai-router.ts` task map.
  **Primary = OpenAI `gpt-4o`, fallback = Anthropic `claude-sonnet-4-…`**.
  (gpt-4o is primary on purpose: the brief sits on a synchronous request
  path, so we must not eat slow retries when one provider is degraded.)
- **Hard latency bound** `IMAGE_BRIEF_TIMEOUT_MS` (default 12000). If the
  LLM is slow/down, the brief falls back to a **deterministic** prompt
  built from the topic content. Image generation must **never** hard-depend
  on the text-AI provider being up.
- `purpose` + `style` are chosen **deterministically in code** from
  `visualType` + keyword hints (math/formula → `formula_card` → Ideogram;
  infographic/chart → `comparison_infographic`; else labeled
  `tutorial_diagram`/`science_diagram`).

### 0.3 Topic image attachment + idempotent sync (NEW)

- **Attachment columns on the topic node** (`syllabus_nodes` in ExamForge):
  `image_url`, `image_key`, `image_status`
  (`none|queued|ready|skipped|error`), `image_content_hash`.
- **Provenance link** on `image_generations`: `syllabus_node_id` (bigint FK,
  `ON DELETE set null`) — because `content_id` is `uuid` and can't hold a
  bigint node id.
- **`services/topic-image-sync.ts`** — `syncTopicImage(nodeId, …, db)` is the
  single source of truth (brief → route → generate → persist on node).
  **Idempotent:** the content hash =
  `sha256(title|description|keyTerms|tutorialText | additionalPrompt | overrideKey)`.
  Unchanged inputs → skip (no LLM, no image cost). Re-extracted syllabus /
  regenerated tutorial / **a new additional-prompt or override** → hash
  changes → a new image is generated.
- **Multiple images per topic:** every generation inserts a row in
  `image_generations` (keyed by `syllabus_node_id`) — nothing is overwritten.
  `syllabus_nodes.image_url` just tracks the latest. So a topic accumulates a
  gallery of images; the reader shows all of them (§0.7). "Generate another
  image" + an additional prompt is the intended way to add variations.
- **Two ways to run it:**
  - **Single topic (MVP default):** `imageGeneration.syncTopic` admin
    mutation runs `syncTopicImage` **inline** (no worker needed) and returns
    the result immediately. Cheap to test.
  - **Whole syllabus (background):** `imageGeneration.syncSyllabus` enqueues
    a job → `workers/image-sync-worker.ts` (+ `queues/image-sync-queue.ts`)
    iterates eligible topics, calling the same service. Non-fatal per topic;
    **pauses the run on budget exhaustion**; skips structural nodes
    (`nodeType` unit/root).

### 0.4 tRPC surface (`trpc/routers/image-generation.ts`)

`generate` (protected) · `getStats` (admin, monthly aggregates) ·
`getHistory` (protected) · `listImages` (admin — **searchable + paginated**
gallery; joins topic title, derives provider from model; full metadata) ·
`listTopicImages` (admin — all images for one topic) ·
`listSyllabi` (admin, picker) · `listTopics` (admin, picker; returns
`hasTutorial` so the UI can flag section nodes with no reader page) ·
`syncTopic` (admin, inline single-topic; accepts `additionalPrompt` + optional
`aspectRatio`/`size`/`purpose`/`style` overrides) ·
`syncSyllabus` (admin, enqueue) · `getSyncStatus` (admin, counts by
`image_status`).

### 0.5 Admin UI

- **Dedicated page `/admin/images`** (not buried in settings). Left-nav item
  **"Image Gen"** placed **below "Learn"** (admin-only).
- The page uses **Tabs** (one thing at a time — avoids confusion):
  1. **Single image** — manual prompt tester (`image-gen-test-panel.tsx`) +
     **Generated Images** gallery (`image-gen-gallery.tsx`, `listImages`) with
     a **Grid/Table toggle**, **server-side search** (topic, prompt, purpose,
     model), **pagination**, and full metadata per image (topic/context,
     prompt, provider/model, size, cost, generation time, timestamp). The
     table exists so an admin can find an existing image and avoid
     regenerating one (wasting tokens).
  2. **Topic sync** — `image-sync-panel.tsx`: syllabus dropdown
     (`listSyllabi`) → topic dropdown (`listTopics`) for single-topic, plus a
     **"whole syllabus (background worker)" toggle**. On selecting a topic it
     shows **all images already on that topic** (with metadata), an optional
     **additional-prompt** box, and an optional **overrides** row
     (purpose/aspect/size/style, each defaulting to _Auto_). Force-regenerate
     checkbox + live status row. Single-topic generation is **resilient**: it
     polls `listTopicImages` so the new image surfaces even when the dev/prod
     rewrite proxy drops the long synchronous response (see §0.7 note).
  3. **Usage & cost** — `image-gen-stats.tsx`.
- A **Help dialog** (button top-right) documents prerequisites + per-tab
  steps + budget thresholds.

### 0.6 Image viewer / lightbox (NEW — user-requested)

`apps/web/src/components/image-lightbox.tsx` — a reusable full-screen
overlay. Clicking any generated image opens it (do **not** open in a new
tab). Features:

- **Zoom** — toolbar buttons + **mouse-wheel**, 25%–600%, with a live %.
- **Rotate** — ±90° (left/right).
- **Drag-to-pan** when zoomed >100% — pointer-capture, **1:1 with the
  cursor** (translate applied in screen space so it tracks regardless of
  zoom/rotation); re-centers on zoom-out; a drag that ends on the backdrop
  does **not** close the viewer.
- **Reset**, **Close** (X button, `Esc`, or backdrop click).

Wired into: the Recent Images gallery, the single-image result preview, the
topic-sync result preview, and the **student tutorial reader hero**.

### 0.7 Reader integration

`learn.getTutorialContent` returns an **`images[]`** array (each
`{ id, cdnUrl, prompt }`); the reader (`learn-content.tsx`) renders **all** of
them as clickable figures under the title, each with its **full prompt as a
visible caption** (relative `/api/images/*` URLs are prefixed with
`NEXT_PUBLIC_API_URL`). Clicking opens the lightbox. PadVik: do the same on its
content reader.

**Section/ancestor fallback (important):** a node can be a _section_
(e.g. "Organic chemistry") whose content lives in its children and which has
no reader page of its own. So `getTutorialContent` resolves images by walking
**self → nearest ancestor** that has any image, and returns **all** images of
that node. Net effect: an image generated on a section appears (with its
description) on every sub-topic page; a leaf's own image always wins over an
ancestor's. (`image_url` on the node is just the latest single image / cheap
"has-images" marker; the full set lives in `image_generations` by
`syllabus_node_id`.)

**Why single-topic generation polls (proxy timeout):** the web calls the API
through a same-origin rewrite proxy (so HttpOnly cookies forward). A long
synchronous generation (~30s+) can exceed that proxy's timeout — the response
is dropped (`socket hang up` / non-JSON) **even though the backend finished
and saved the image**. The UI therefore treats transport errors as
non-fatal and polls `listTopicImages` until the image appears (with a 2-min
safety cap). Keep this behaviour in PadVik.

### 0.8 Tutorial-agent hook (optional, opt-in)

`enrichWithDiagram` in the tutorial worker is gated by
`TUTORIAL_DIAGRAM_GENERATION=true` (off by default). When on, it generates a
diagram, **persists it onto the node** (`image_url`/`image_key`/`image_status`)
and injects an `<img>` into the tutorial HTML. ⚠️ If you enable both this and
the reader hero, the image renders twice — pick one render site.

### 0.9 Full environment variables (as shipped)

```bash
# Reused — no new key needed for GPT Image / gpt-4o briefs
OPENAI_API_KEY=
# Providers
GOOGLE_AI_API_KEY=                 # Imagen 4 (Google AI Studio)
IDEOGRAM_API_KEY=                  # Ideogram 3.0 (text-heavy)
# Storage
IMAGE_STORAGE_DRIVER=local         # local | s3 (auto: s3 if IMAGE_S3_BUCKET set)
IMAGE_STORAGE_DIR=                 # local driver dir; on Railway = Volume mount (e.g. /data/images)
IMAGE_PUBLIC_BASE_URL=             # optional absolute API origin for stored URLs
IMAGE_S3_BUCKET=                   # [PLATFORM] examforge-images | padvik-images (or an R2 bucket)
IMAGE_CLOUDFRONT_DOMAIN=
IMAGE_DEFAULT_QUALITY=standard
IMAGE_MONTHLY_BUDGET_USD=100
IMAGE_BRIEF_TIMEOUT_MS=12000       # bound on the context-brief LLM step
TUTORIAL_DIAGRAM_GENERATION=false  # opt-in inline tutorial diagrams
```

### 0.10 File map (as built)

```
apps/api/src/ai/image-providers/{types,openai-image,google-image,ideogram-image}.ts
apps/api/src/ai/image-prompts/{prompt-enhancer,image-brief}.ts
apps/api/src/ai/image-router.ts
apps/api/src/lib/s3.ts
apps/api/src/services/{image-storage,topic-image-sync}.ts
apps/api/src/queues/image-sync-queue.ts
apps/api/src/workers/image-sync-worker.ts          (+ register in workers/index.ts)
apps/api/src/trpc/routers/image-generation.ts      (+ register in trpc/index.ts)
apps/api/src/index.ts                              (+ GET /api/images/* route)
apps/api/src/ai/{ai-router,types}.ts               (+ derive_image_brief task)
apps/web/src/components/image-lightbox.tsx
apps/web/src/components/admin/{image-gen-test-panel,image-sync-panel,image-gen-stats,image-gen-gallery}.tsx
apps/web/src/app/(dashboard)/admin/images/page.tsx
apps/web/src/app/(dashboard)/layout.tsx            (+ "Image Gen" nav item below Learn)
apps/web/src/app/(dashboard)/learn/[id]/learn-content.tsx + trpc learn.getTutorialContent (hero)
packages/shared/src/db/schema/image-generations.ts (+ syllabus_node_id)
packages/shared/src/db/schema/syllabus-nodes.ts    (+ image_* columns)
```

---

## 1. Why Multi-Model Routing

No single model is best at everything. The landscape in 2026:

| Model                              | Best At                                                | Weak At                       | Cost       |
| ---------------------------------- | ------------------------------------------------------ | ----------------------------- | ---------- |
| **GPT Image 1.5** (OpenAI)         | Complex scenes, scientific accuracy, prompt adherence  | Text rendering in images      | $0.04/img  |
| **Ideogram 3.0**                   | Text inside images, logos, formula cards, infographics | Photorealism                  | $0.03/img  |
| **Imagen 4 Fast** (Google)         | Speed, decorative images, thumbnails, consistent style | Complex multi-element scenes  | $0.02/img  |
| **Imagen 4 Standard** (Google)     | Balanced quality + cost                                | Slightly slower               | $0.04/img  |
| **Flux 2 Pro** (Black Forest Labs) | Photorealism, studio-quality                           | Expensive at scale            | $0.055/img |
| **GPT Image 1 Mini** (OpenAI)      | Budget bulk generation, drafts                         | Lower quality at detail level | $0.005/img |

The router picks the right model based on what the image is for.

---

## 2. Image Categories Per Platform

### 2.1 ExamForge Images

| Category                       | Example                                                      | Model             | Priority                     |
| ------------------------------ | ------------------------------------------------------------ | ----------------- | ---------------------------- |
| **Tutorial Diagrams**          | Drug metabolism pathway, enzyme cascade, molecular structure | GPT Image 1.5     | High — accuracy critical     |
| **Formula Cards**              | Henderson-Hasselbalch equation card, SALAD mnemonic visual   | Ideogram 3.0      | High — text must be readable |
| **Comparison Infographics**    | "Oral vs IV vs Sublingual" comparison chart                  | Ideogram 3.0      | Medium                       |
| **Exam Pattern Charts**        | Subject weightage pie chart, difficulty distribution bar     | Ideogram 3.0      | Medium                       |
| **Topic Thumbnails**           | Thumbnail for "Drug Interactions" tutorial                   | Imagen 4 Fast     | Medium — decorative          |
| **Exam Cover Images**          | "GPAT 2026 Mock Test Series" cover                           | Imagen 4 Fast     | Low                          |
| **Creator Profile Banners**    | Background banner for creator page                           | Imagen 4 Fast     | Low                          |
| **Marketplace Listing Covers** | Product image for "500 Pharmacology MCQs"                    | Imagen 4 Standard | Medium                       |
| **Social Media / Marketing**   | Instagram post, WhatsApp share card                          | GPT Image 1.5     | Low — batch                  |
| **Placeholder / Draft**        | Temp images during content pipeline                          | GPT Image 1 Mini  | Low — cheapest               |

### 2.2 PadVik Images

| Category                   | Example                                              | Model         | Priority             |
| -------------------------- | ---------------------------------------------------- | ------------- | -------------------- |
| **Chapter Illustrations**  | Photosynthesis process, cell division diagram        | GPT Image 1.5 | High                 |
| **Math Visualizations**    | Geometry theorem diagram, trigonometry graph         | Ideogram 3.0  | High — labels matter |
| **Science Diagrams**       | Circuit diagram, periodic table section, human heart | GPT Image 1.5 | High                 |
| **History/Geography**      | Timeline infographic, map illustration               | Ideogram 3.0  | Medium               |
| **Chapter Thumbnails**     | Thumbnail for "Chapter 3: Electricity"               | Imagen 4 Fast | Medium               |
| **Board/Subject Icons**    | CBSE icon, Physics icon, Class 10 badge              | Imagen 4 Fast | Low                  |
| **Creator Content Thumbs** | Auto-generated thumbnail for uploaded video          | Imagen 4 Fast | Medium               |
| **Worksheet Headers**      | Decorative header for printed worksheet              | Ideogram 3.0  | Low                  |
| **Classroom Banners**      | "NEET 2026 Morning Batch" classroom image            | Imagen 4 Fast | Low                  |
| **Doubt Visualization**    | When student asks about a diagram, generate one      | GPT Image 1.5 | High — on-demand     |

---

## 3. Architecture

### 3.1 Image Router Service

```typescript
// Shared: can live in packages/shared or in each app's api layer

export type ImagePurpose =
  // ExamForge
  | "tutorial_diagram" // scientific/medical/pharmacy diagrams
  | "formula_card" // math formulas, mnemonic visuals
  | "comparison_infographic" // side-by-side comparisons
  | "pattern_chart" // exam pattern visualization
  | "topic_thumbnail" // decorative thumbnail for topics
  | "exam_cover" // exam/test series cover image
  | "marketplace_cover" // marketplace listing cover
  | "creator_banner" // creator profile banner
  | "social_media" // marketing images
  // PadVik
  | "chapter_illustration" // NCERT-style educational illustration
  | "math_visualization" // geometry, graphs, equations
  | "science_diagram" // physics, chemistry, biology diagrams
  | "history_infographic" // timelines, maps
  | "chapter_thumbnail" // chapter cover image
  | "board_icon" // board/subject icons
  | "worksheet_header" // printable worksheet decoration
  | "classroom_banner" // classroom cover
  // Shared
  | "doubt_visualization" // on-demand diagram for doubt answers
  | "placeholder" // temporary/draft images
  | "custom"; // creator specifies model manually

export interface ImageGenerationRequest {
  purpose: ImagePurpose;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  size?: "small" | "standard" | "hd"; // maps to resolution per model
  style?: "realistic" | "illustration" | "diagram" | "flat" | "watercolor";
  // Override
  forceModel?: string; // skip routing, use this model
  // Context
  platform: "examforge" | "padvik";
  userId?: string;
  contentId?: string; // link to content being generated for
}

export interface ImageGenerationResult {
  url: string; // S3 URL of generated image
  cdnUrl: string; // CloudFront URL
  model: string; // which model was used
  cost: number; // USD cost
  generationTimeMs: number;
  width: number;
  height: number;
}
```

### 3.2 Routing Logic

```typescript
// apps/api/src/ai/image-router.ts

const MODEL_ROUTING: Record<ImagePurpose, ModelConfig> = {
  // ── HIGH ACCURACY (scientific, medical, educational) ──
  tutorial_diagram: { model: "gpt-image-1.5", fallback: "imagen-4-standard", cost: 0.04 },
  chapter_illustration: { model: "gpt-image-1.5", fallback: "imagen-4-standard", cost: 0.04 },
  science_diagram: { model: "gpt-image-1.5", fallback: "imagen-4-standard", cost: 0.04 },
  doubt_visualization: { model: "gpt-image-1.5", fallback: "imagen-4-standard", cost: 0.04 },

  // ── TEXT-HEAVY (formulas, infographics, labels) ──
  formula_card: { model: "ideogram-3.0", fallback: "gpt-image-1.5", cost: 0.03 },
  comparison_infographic: { model: "ideogram-3.0", fallback: "gpt-image-1.5", cost: 0.03 },
  math_visualization: { model: "ideogram-3.0", fallback: "gpt-image-1.5", cost: 0.03 },
  pattern_chart: { model: "ideogram-3.0", fallback: "gpt-image-1.5", cost: 0.03 },
  history_infographic: { model: "ideogram-3.0", fallback: "gpt-image-1.5", cost: 0.03 },
  worksheet_header: { model: "ideogram-3.0", fallback: "imagen-4-fast", cost: 0.03 },

  // ── DECORATIVE (thumbnails, covers, banners) ──
  topic_thumbnail: { model: "imagen-4-fast", fallback: "gpt-image-1-mini", cost: 0.02 },
  exam_cover: { model: "imagen-4-fast", fallback: "gpt-image-1-mini", cost: 0.02 },
  chapter_thumbnail: { model: "imagen-4-fast", fallback: "gpt-image-1-mini", cost: 0.02 },
  board_icon: { model: "imagen-4-fast", fallback: "gpt-image-1-mini", cost: 0.02 },
  creator_banner: { model: "imagen-4-fast", fallback: "gpt-image-1-mini", cost: 0.02 },
  classroom_banner: { model: "imagen-4-fast", fallback: "gpt-image-1-mini", cost: 0.02 },

  // ── PREMIUM (marketplace, social — needs to look great) ──
  marketplace_cover: { model: "imagen-4-standard", fallback: "gpt-image-1.5", cost: 0.04 },
  social_media: { model: "gpt-image-1.5", fallback: "imagen-4-standard", cost: 0.04 },

  // ── BUDGET ──
  placeholder: { model: "gpt-image-1-mini", fallback: "imagen-4-fast", cost: 0.005 },
  custom: { model: "gpt-image-1.5", fallback: "imagen-4-standard", cost: 0.04 },
};
```

### 3.3 Provider Implementations

```typescript
// apps/api/src/ai/image-providers/openai-image.ts

export async function generateWithOpenAI(params: {
  model: "gpt-image-1.5" | "gpt-image-1" | "gpt-image-1-mini";
  prompt: string;
  size: string;
  quality: string;
}): Promise<{ imageData: Buffer; cost: number }> {
  const response = await openai.images.generate({
    model: params.model,
    prompt: params.prompt,
    n: 1,
    size: params.size, // "1024x1024", "1536x1024", etc.
    quality: params.quality, // "low", "medium", "high"
    response_format: "b64_json",
  });

  return {
    imageData: Buffer.from(response.data[0].b64_json!, "base64"),
    cost: MODEL_COSTS[params.model],
  };
}

// apps/api/src/ai/image-providers/google-image.ts

export async function generateWithGoogle(params: {
  model: "imagen-4-fast" | "imagen-4-standard" | "imagen-4-ultra";
  prompt: string;
  aspectRatio: string;
}): Promise<{ imageData: Buffer; cost: number }> {
  // Google Imagen API via Vertex AI or AI Studio
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateImages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GOOGLE_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: params.prompt,
        number_of_images: 1,
        aspect_ratio: params.aspectRatio,
        safety_filter_level: "block_some",
      }),
    },
  );
  // ... parse response
}

// apps/api/src/ai/image-providers/ideogram-image.ts

export async function generateWithIdeogram(params: {
  prompt: string;
  aspectRatio: string;
  style: string;
}): Promise<{ imageData: Buffer; cost: number }> {
  const response = await fetch("https://api.ideogram.ai/generate", {
    method: "POST",
    headers: {
      "Api-Key": IDEOGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_request: {
        prompt: params.prompt,
        aspect_ratio: params.aspectRatio,
        model: "V_3",
        magic_prompt_option: "AUTO",
        style_type: params.style === "realistic" ? "REALISTIC" : "DESIGN",
      },
    }),
  });
  // ... parse response
}
```

### 3.4 Main Image Router

```typescript
// apps/api/src/ai/image-router.ts

export async function generateImage(
  request: ImageGenerationRequest,
): Promise<ImageGenerationResult> {
  const startTime = Date.now();

  // 1. Determine model from purpose
  const config = request.forceModel
    ? { model: request.forceModel, fallback: null, cost: 0.04 }
    : MODEL_ROUTING[request.purpose];

  // 2. Build enhanced prompt based on purpose and platform
  const enhancedPrompt = buildEnhancedPrompt(request);

  // 3. Map aspect ratio to provider-specific size
  const size = mapSize(request.aspectRatio, request.size, config.model);

  // 4. Generate with primary model, fallback on error
  let imageData: Buffer;
  let usedModel = config.model;
  let cost = config.cost;

  try {
    const result = await callProvider(config.model, enhancedPrompt, size, request.style);
    imageData = result.imageData;
    cost = result.cost;
  } catch (error) {
    console.warn(
      `Image generation failed with ${config.model}, falling back to ${config.fallback}`,
    );
    if (!config.fallback) throw error;
    const result = await callProvider(config.fallback, enhancedPrompt, size, request.style);
    imageData = result.imageData;
    usedModel = config.fallback;
    cost = result.cost;
  }

  // 5. Upload to S3
  const s3Key = `generated-images/${request.platform}/${request.purpose}/${Date.now()}-${randomId()}.png`;
  await uploadToS3(s3Key, imageData, "image/png");
  const cdnUrl = `${CLOUDFRONT_DOMAIN}/${s3Key}`;

  // 6. Log usage
  await logImageGeneration({
    platform: request.platform,
    purpose: request.purpose,
    model: usedModel,
    cost,
    generationTimeMs: Date.now() - startTime,
    userId: request.userId,
    contentId: request.contentId,
    s3Key,
  });

  return {
    url: `https://${S3_BUCKET}.s3.amazonaws.com/${s3Key}`,
    cdnUrl,
    model: usedModel,
    cost,
    generationTimeMs: Date.now() - startTime,
    width: size.width,
    height: size.height,
  };
}
```

---

## 4. Prompt Engineering Per Category

The raw user prompt is enhanced based on purpose and platform:

```typescript
// apps/api/src/ai/image-prompts/prompt-enhancer.ts

function buildEnhancedPrompt(request: ImageGenerationRequest): string {
  const { purpose, prompt, platform, style } = request;

  // Base style prefix
  const styleMap: Record<string, string> = {
    realistic: "Photorealistic, high detail, natural lighting.",
    illustration: "Clean educational illustration, vector-style, professional.",
    diagram:
      "Technical diagram, labeled, clean lines, white background, professional textbook style.",
    flat: "Flat design, minimal, clean, modern UI style, vibrant colors.",
    watercolor: "Watercolor illustration, soft colors, artistic, educational.",
  };

  const stylePrefix = styleMap[style || "illustration"] || "";

  // Purpose-specific enhancement
  switch (purpose) {
    case "tutorial_diagram":
    case "science_diagram":
    case "chapter_illustration":
      return `${stylePrefix} Educational diagram for ${platform === "examforge" ? "competitive exam preparation" : "K-12 Indian curriculum"}. ${prompt}. Clean, labeled, textbook-quality. White or light background. No watermarks. Suitable for academic use.`;

    case "formula_card":
    case "math_visualization":
      return `${stylePrefix} Educational card with clear, readable text and mathematical notation. ${prompt}. Large readable font. Clean layout with proper spacing. Background: light gradient. Professional academic design.`;

    case "comparison_infographic":
    case "pattern_chart":
    case "history_infographic":
      return `${stylePrefix} Professional infographic. ${prompt}. Clean data visualization. Readable labels. Color-coded sections. Modern flat design. White background.`;

    case "topic_thumbnail":
    case "chapter_thumbnail":
    case "exam_cover":
    case "classroom_banner":
      return `${stylePrefix} Eye-catching thumbnail for educational content. ${prompt}. Vibrant colors. Modern design. No text (text will be overlaid by the app). 16:9 aspect ratio composition.`;

    case "marketplace_cover":
      return `${stylePrefix} Professional product cover image for educational content marketplace. ${prompt}. Premium look. Clean composition. Would look good as a product card in an app store.`;

    case "doubt_visualization":
      return `${stylePrefix} Quick educational diagram to answer a student's question. ${prompt}. Simple, clear, focused on the concept. Labeled parts. White background.`;

    case "social_media":
      return `${stylePrefix} Social media post image for Indian education platform. ${prompt}. Eye-catching. Modern. Would perform well on Instagram/WhatsApp. Include space for text overlay.`;

    case "placeholder":
      return `Simple placeholder illustration. ${prompt}. Minimal detail needed.`;

    default:
      return `${stylePrefix} ${prompt}`;
  }
}
```

---

## 5. Integration Points

### 5.1 ExamForge — Tutorial Agent Integration

When the tutorial agent generates HTML tutorials, it can now include
AI-generated diagrams instead of relying solely on inline SVG:

```typescript
// In tutorial-agent-worker.ts, when processing a topic:

// Check if the topic would benefit from a diagram
if (topicNeedsDiagram(syllabusNode)) {
  const diagramPrompt = await buildDiagramPrompt(syllabusNode, examName);
  // e.g., "Drug absorption pathway showing oral ingestion through
  //  GI tract, portal vein, hepatic first-pass metabolism, and
  //  systemic circulation. Label each stage."

  const image = await generateImage({
    purpose: "tutorial_diagram",
    prompt: diagramPrompt,
    aspectRatio: "16:9",
    style: "diagram",
    platform: "examforge",
    contentId: tutorialFileId,
  });

  // Inject into tutorial HTML:
  // <div class="diagram">
  //   <img src="{image.cdnUrl}" alt="{diagramPrompt}" loading="lazy" />
  //   <figcaption>Fig: Drug absorption and first-pass metabolism</figcaption>
  // </div>
}
```

### 5.2 ExamForge — Exam Pattern Visualization

When showing pattern analysis to users:

```typescript
// Generate a visual summary of the exam pattern
const patternImage = await generateImage({
  purpose: "pattern_chart",
  prompt: `Exam pattern breakdown for ${examName}:
    Pharmacology 30%, Pharmaceutics 25%, Pharm Chemistry 15%,
    Pharmacognosy 10%, GK 10%, Current Affairs 10%.
    Show as a clean pie chart with labeled segments and percentages.`,
  aspectRatio: "1:1",
  style: "flat",
  platform: "examforge",
});
```

### 5.3 PadVik — Chapter Content Enhancement

When the content pipeline processes NCERT chapters:

```typescript
// For chapters that need illustrations
const illustration = await generateImage({
  purpose: "chapter_illustration",
  prompt: `Diagram of the human digestive system for Class 10 Biology.
    Label: mouth, esophagus, stomach, small intestine, large intestine,
    liver, pancreas, rectum. NCERT textbook style illustration.`,
  aspectRatio: "3:4",
  style: "illustration",
  platform: "padvik",
});
```

### 5.4 Shared — Creator Content Auto-Thumbnails

When a creator uploads content without a thumbnail:

```typescript
// Auto-generate thumbnail from content title + subject
if (!creatorContent.thumbnailUrl) {
  const thumbnail = await generateImage({
    purpose: creatorContent.platform === "examforge" ? "topic_thumbnail" : "chapter_thumbnail",
    prompt: `Thumbnail for educational content: "${creatorContent.title}".
      Subject: ${creatorContent.subject}. Modern, vibrant, educational.`,
    aspectRatio: "16:9",
    style: "flat",
    platform: creatorContent.platform,
    contentId: creatorContent.id,
  });

  await updateContentThumbnail(creatorContent.id, thumbnail.cdnUrl);
}
```

### 5.5 Shared — Doubt Answer Diagrams

When AI answers a student's doubt, it can generate a diagram:

```typescript
// In the doubt AI response pipeline
if (aiResponse.needsDiagram) {
  const diagram = await generateImage({
    purpose: "doubt_visualization",
    prompt: aiResponse.diagramDescription,
    // e.g., "Simple circuit diagram showing a battery, two resistors
    //  in parallel, an ammeter, and a voltmeter"
    aspectRatio: "4:3",
    style: "diagram",
    platform: currentPlatform,
  });

  // Include in the doubt response
  aiResponse.images = [{ url: diagram.cdnUrl, caption: aiResponse.diagramCaption }];
}
```

### 5.6 Shared — Marketplace Listing Covers

When a creator lists content on the marketplace:

```typescript
// Auto-generate cover if not provided
if (!listing.coverImageUrl) {
  const cover = await generateImage({
    purpose: "marketplace_cover",
    prompt: `Professional cover image for "${listing.title}".
      Content type: ${listing.listingType}. Subject: ${listing.subjects.join(", ")}.
      ${listing.questionCount ? `Contains ${listing.questionCount} questions.` : ""}
      Premium educational product. Clean, modern design.`,
    aspectRatio: "4:3",
    style: "flat",
    platform: "examforge",
    contentId: listing.id,
  });

  await updateListingCover(listing.id, cover.cdnUrl);
}
```

---

## 6. Database — Image Generation Tracking

```sql
CREATE TABLE image_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(20) NOT NULL,           -- examforge | padvik
  purpose VARCHAR(50) NOT NULL,            -- tutorial_diagram, formula_card, etc.
  model VARCHAR(50) NOT NULL,              -- gpt-image-1.5, ideogram-3.0, etc.

  prompt TEXT NOT NULL,
  enhanced_prompt TEXT,                    -- after prompt engineering
  negative_prompt TEXT,

  -- Result
  s3_key VARCHAR(500) NOT NULL,
  cdn_url VARCHAR(1000),
  width INTEGER,
  height INTEGER,

  -- Cost
  cost_usd REAL NOT NULL,
  generation_time_ms INTEGER,

  -- Context
  user_id UUID REFERENCES users(id),
  content_id UUID,                         -- tutorial_files.id, creator_content.id, etc.
  content_type VARCHAR(50),                -- tutorial, marketplace_listing, doubt, etc.

  -- Quality
  was_fallback BOOLEAN DEFAULT false,      -- did primary model fail?
  fallback_model VARCHAR(50),
  user_rating SMALLINT,                    -- 1-5 if user rates the image

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_image_gen_platform ON image_generations(platform);
CREATE INDEX idx_image_gen_purpose ON image_generations(purpose);
CREATE INDEX idx_image_gen_content ON image_generations(content_id);
```

---

## 7. Environment Variables

```bash
# Add to .env.example for both ExamForge and PadVik

# Image Generation — OpenAI
OPENAI_API_KEY=sk-xxxxx                    # already exists for text, shared

# Image Generation — Google
GOOGLE_AI_API_KEY=xxxxx                    # for Imagen 4

# Image Generation — Ideogram
IDEOGRAM_API_KEY=xxxxx                     # for text-heavy images

# Image Generation — Config
IMAGE_S3_BUCKET=examforge-images           # or padvik-images
IMAGE_CLOUDFRONT_DOMAIN=d1234.cloudfront.net
IMAGE_DEFAULT_QUALITY=standard             # standard | hd
IMAGE_MONTHLY_BUDGET_USD=100               # alert when exceeded
```

---

## 8. Cost Controls

```typescript
// apps/api/src/ai/image-router.ts — budget enforcement

const MONTHLY_BUDGET_USD = parseFloat(process.env.IMAGE_MONTHLY_BUDGET_USD || "100");

async function checkBudget(): Promise<boolean> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const spent = await db
    .select({ total: sql<number>`SUM(cost_usd)` })
    .from(imageGenerations)
    .where(gte(imageGenerations.createdAt, startOfMonth));

  const totalSpent = spent[0]?.total || 0;

  if (totalSpent >= MONTHLY_BUDGET_USD) {
    console.error(`Image generation budget exceeded: $${totalSpent} / $${MONTHLY_BUDGET_USD}`);
    // Send alert to admin
    return false;
  }

  if (totalSpent >= MONTHLY_BUDGET_USD * 0.8) {
    console.warn(`Image generation budget 80% used: $${totalSpent} / $${MONTHLY_BUDGET_USD}`);
  }

  return true;
}

// Downgrade model when budget is tight
function getBudgetAwareModel(purpose: ImagePurpose): ModelConfig {
  const config = MODEL_ROUTING[purpose];
  const budgetUsage = getCachedBudgetUsage(); // refreshed every 10 min

  if (budgetUsage > 0.9) {
    // Over 90% budget used — downgrade everything to cheapest
    return { model: "gpt-image-1-mini", fallback: null, cost: 0.005 };
  }

  if (budgetUsage > 0.7) {
    // Over 70% — downgrade decorative images only
    if (
      [
        "topic_thumbnail",
        "exam_cover",
        "chapter_thumbnail",
        "board_icon",
        "creator_banner",
        "classroom_banner",
      ].includes(purpose)
    ) {
      return { model: "gpt-image-1-mini", fallback: null, cost: 0.005 };
    }
  }

  return config;
}
```

---

## 9. Admin Dashboard — Image Generation Stats

Add to the existing admin dashboard (ExamForge `/admin/settings` or a new panel):

```
┌─────────────────────────────────────────────────────┐
│  🖼️ Image Generation Stats            [This Month] │
│                                                      │
│  Total Generated: 3,847 images                       │
│  Total Cost: $62.40 / $100.00 budget  ████████░░ 62%│
│                                                      │
│  By Model:                                           │
│  GPT Image 1.5:    420 imgs   $16.80  (diagrams)    │
│  Ideogram 3.0:     280 imgs   $8.40   (formulas)    │
│  Imagen 4 Fast:    1,890 imgs $37.80  (thumbnails)  │
│  GPT Image 1 Mini: 1,257 imgs $6.29   (drafts)     │
│                                                      │
│  By Purpose:                                         │
│  Tutorial diagrams:    420  │ Thumbnails:    1,890   │
│  Formula cards:        180  │ Marketplace:   120     │
│  Doubt visualizations: 100  │ Placeholders:  1,137   │
│                                                      │
│  Fallback rate: 2.3% (89 images used fallback model) │
│  Avg generation time: 4.2 seconds                    │
└─────────────────────────────────────────────────────┘
```

---

## 10. Claude Code Implementation Prompt

> **⛔ SAFETY: This creates NEW files only. No existing files are modified
> except appending exports to index files and adding env vars.**

### STEP 1: Database + Config

`commit: feat(db): add image_generations tracking table`

1A. Create `packages/shared/src/db/schema/image-generations.ts`
with the table from section 6.
1B. APPEND export to `packages/shared/src/db/schema/index.ts`
1C. Generate migration, inspect, run.
1D. Add env vars to `.env.example` (APPEND, don't rewrite).

### STEP 2: Provider Implementations

`commit: feat(ai): add image generation providers for OpenAI, Google, Ideogram`

2A. Create `apps/api/src/ai/image-providers/openai-image.ts`
2B. Create `apps/api/src/ai/image-providers/google-image.ts`
2C. Create `apps/api/src/ai/image-providers/ideogram-image.ts`

Before writing these, READ the existing `apps/api/src/ai/ai-router.ts`
to understand how the project initializes API clients and handles errors.
Match that pattern.

### STEP 3: Image Router + Prompt Enhancer

`commit: feat(ai): add multi-model image router with purpose-based routing`

3A. Create `apps/api/src/ai/image-router.ts` — main router with MODEL_ROUTING
config, provider dispatch, S3 upload, cost logging, budget controls.
3B. Create `apps/api/src/ai/image-prompts/prompt-enhancer.ts` — per-purpose
prompt enhancement.
3C. Create `apps/api/src/ai/image-router.test.ts` — unit tests for routing
logic and prompt enhancement (mock the providers).

### STEP 4: tRPC Endpoint

`commit: feat(api): add image generation tRPC endpoint`

Create `apps/api/src/routers/image-generation.ts`:

```typescript
imageGenerationRouter = router({
  generate: protectedProcedure
    .input(z.object({
      purpose: z.enum([...all ImagePurpose values]),
      prompt: z.string().min(5).max(1000),
      aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1'),
      size: z.enum(['small', 'standard', 'hd']).default('standard'),
      style: z.enum(['realistic', 'illustration', 'diagram', 'flat', 'watercolor']).default('illustration'),
    }))
    .mutation(),

  getStats: adminProcedure
    .query(),
    // Returns: monthly stats by model, purpose, cost

  getHistory: protectedProcedure
    .input(z.object({ contentId: z.string().uuid().optional(), limit: z.number().default(20) }))
    .query(),
});
```

Register in the main router (APPEND).

### STEP 5: Integration Hooks

`commit: feat(integration): add image generation to tutorial agent and content pipeline`

5A. In `apps/api/src/workers/tutorial-agent-worker.ts`:
After generating tutorial HTML, check if diagrams are needed.
If the topic has `has_diagrams: true` in the fingerprint, generate
diagram images and inject `<img>` tags into the HTML.
**Add this as a NEW function called from the worker — don't restructure.**

5B. In creator content upload flow (when it exists):
Auto-generate thumbnail if not provided.
**This is a hook point for future integration — add a TODO comment.**

### STEP 6: Admin Stats Panel

`commit: feat(ui): add image generation stats to admin dashboard`

Create a small component: `apps/web/src/components/admin/image-gen-stats.tsx`

Fetch: `trpc.imageGeneration.getStats.useQuery()`

Display: monthly count, cost bar, by-model breakdown, by-purpose breakdown,
fallback rate. Add this component to the existing admin settings page
(APPEND to the page, don't rewrite it).

### STEP 7: Post-implementation

`commit: chore: verify image generation pipeline`

```bash
pnpm type-check && pnpm lint:fix && pnpm build
```

Test: call the generate endpoint with different purposes, verify routing
to correct models, verify S3 upload, verify cost logging.
