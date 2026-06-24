// Multi-model image router — the single entry point for AI image
// generation across ExamForge and PadVik. Routes purpose → best model,
// applies budget-aware downgrades, enhances the prompt, calls the right
// provider (with fallback), uploads to S3, and logs to image_generations.
//
// This is SEPARATE from ai-router.ts (text AI) by design. Like the text
// router, it takes the Database as an explicit argument rather than
// importing a global db handle.
//
// See docs/features/ai-image-gen/AI_IMAGE_GENERATION.md §3 and §8.

import { randomUUID } from "node:crypto";
import { gte, sql } from "drizzle-orm";
import { imageGenerations } from "@examforge/shared/db/schema";
import type { Database } from "@examforge/shared/db";
import { generateWithOpenAI } from "./image-providers/openai-image.js";
import { generateWithGoogle } from "./image-providers/google-image.js";
import { generateWithIdeogram } from "./image-providers/ideogram-image.js";
import type { ImageProviderResult } from "./image-providers/types.js";
import { buildEnhancedPrompt } from "./image-prompts/prompt-enhancer.js";
import type { ImagePurpose, ImageStyle } from "./image-prompts/prompt-enhancer.js";
import { getImageStorage } from "../services/image-storage.js";

interface ModelConfig {
  model: string;
  fallback: string | null;
  cost: number;
}

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

export type ImageAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
export type ImageSize = "small" | "standard" | "hd";

export interface ImageGenerationRequest {
  purpose: ImagePurpose;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: ImageAspectRatio;
  size?: ImageSize;
  style?: ImageStyle;
  forceModel?: string;
  platform: "examforge" | "padvik";
  userId?: string;
  contentId?: string;
  contentType?: string;
  /** Topic linkage for syllabus-node images (bigint id). */
  syllabusNodeId?: number;
}

export interface ImageGenerationResult {
  url: string;
  cdnUrl: string;
  /** Storage key (s3 key or local path key) — for persisting on the owner. */
  key: string;
  model: string;
  cost: number;
  generationTimeMs: number;
  width: number;
  height: number;
}

export async function generateImage(
  request: ImageGenerationRequest,
  db: Database,
): Promise<ImageGenerationResult> {
  const startTime = Date.now();

  // 1. Budget check + downgrade
  const config = await getBudgetAwareModel(request.purpose, db, request.forceModel);

  // 2. Enhance prompt
  const enhancedPrompt = buildEnhancedPrompt({
    purpose: request.purpose,
    prompt: request.prompt,
    platform: request.platform,
    style: request.style,
  });

  const aspectRatio: ImageAspectRatio = request.aspectRatio ?? "1:1";

  // 3. Generate with fallback
  let result: ImageProviderResult;
  let usedModel = config.model;
  let wasFallback = false;

  try {
    result = await callProvider(config.model, enhancedPrompt, aspectRatio, request);
  } catch (error) {
    console.warn(
      `[image-router] Generation failed with ${config.model}: ${
        error instanceof Error ? error.message : String(error)
      }. Trying fallback ${config.fallback}`,
    );
    if (!config.fallback) throw error;
    result = await callProvider(config.fallback, enhancedPrompt, aspectRatio, request);
    usedModel = config.fallback;
    wasFallback = true;
  }

  // 4. Persist via the configured storage driver (local | s3). The DB's
  //    s3Key column holds the storage key regardless of driver.
  const storage = getImageStorage();
  const storageKey = `generated-images/${request.platform}/${request.purpose}/${Date.now()}-${randomUUID()}.png`;
  await storage.upload(storageKey, result.imageData, "image/png");
  const url = storage.getUrl(storageKey);

  const generationTimeMs = Date.now() - startTime;

  // 5. Log
  await db.insert(imageGenerations).values({
    platform: request.platform,
    purpose: request.purpose,
    model: usedModel,
    prompt: request.prompt,
    enhancedPrompt,
    negativePrompt: request.negativePrompt,
    s3Key: storageKey,
    cdnUrl: url,
    width: result.width,
    height: result.height,
    costUsd: result.cost,
    generationTimeMs,
    userId: request.userId,
    contentId: request.contentId,
    contentType: request.contentType,
    syllabusNodeId: request.syllabusNodeId,
    wasFallback,
    fallbackModel: wasFallback ? usedModel : null,
  });

  return {
    url,
    cdnUrl: url,
    key: storageKey,
    model: usedModel,
    cost: result.cost,
    generationTimeMs,
    width: result.width,
    height: result.height,
  };
}

async function callProvider(
  model: string,
  prompt: string,
  aspectRatio: ImageAspectRatio,
  request: ImageGenerationRequest,
): Promise<ImageProviderResult> {
  const quality = request.size === "hd" ? "high" : request.size === "small" ? "low" : "medium";

  if (model.startsWith("gpt-image")) {
    const size =
      aspectRatio === "16:9" ? "1536x1024" : aspectRatio === "9:16" ? "1024x1536" : "1024x1024";
    return generateWithOpenAI({
      model: model as "gpt-image-1.5" | "gpt-image-1" | "gpt-image-1-mini",
      prompt,
      size,
      quality,
    });
  }
  if (model.startsWith("imagen")) {
    return generateWithGoogle({
      model: model as "imagen-4-fast" | "imagen-4-standard" | "imagen-4-ultra",
      prompt,
      aspectRatio,
    });
  }
  if (model.startsWith("ideogram")) {
    return generateWithIdeogram({ prompt, aspectRatio, style: request.style ?? "illustration" });
  }
  throw new Error(`Unknown image model: ${model}`);
}

async function getBudgetAwareModel(
  purpose: ImagePurpose,
  db: Database,
  forceModel?: string,
): Promise<ModelConfig> {
  if (forceModel) return { model: forceModel, fallback: null, cost: 0.04 };

  const config = MODEL_ROUTING[purpose];
  const budget = parseFloat(process.env.IMAGE_MONTHLY_BUDGET_USD ?? "100");

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const spent = await db
    .select({ total: sql<number>`COALESCE(SUM(${imageGenerations.costUsd}), 0)` })
    .from(imageGenerations)
    .where(gte(imageGenerations.createdAt, startOfMonth));

  const usage = (spent[0]?.total ?? 0) / budget;

  if (usage >= 1.0) throw new Error("Monthly image generation budget exceeded");
  if (usage >= 0.9) return { model: "gpt-image-1-mini", fallback: null, cost: 0.005 };
  if (usage >= 0.7) {
    const decorative: ImagePurpose[] = [
      "topic_thumbnail",
      "exam_cover",
      "chapter_thumbnail",
      "board_icon",
      "creator_banner",
      "classroom_banner",
    ];
    if (decorative.includes(purpose)) {
      return { model: "gpt-image-1-mini", fallback: null, cost: 0.005 };
    }
  }
  return config;
}

// Re-exported so callers (tRPC router, workers) can import everything
// image-gen-related from a single module.
export { buildEnhancedPrompt } from "./image-prompts/prompt-enhancer.js";
export type { ImagePurpose, ImageStyle } from "./image-prompts/prompt-enhancer.js";
