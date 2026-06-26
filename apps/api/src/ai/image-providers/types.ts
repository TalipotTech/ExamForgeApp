// Shared types + cost table for image providers.
// One ImageProviderResult per generated image. Costs are per-image USD
// estimates (see docs/features/ai-image-gen/AI_IMAGE_GENERATION.md §1).

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

// Maps a stored model id back to its provider — image_generations records
// the model, not the provider, so we derive it for display.
export function modelToProvider(model: string): string {
  if (model.startsWith("gpt-image")) return "openai";
  if (model.startsWith("imagen")) return "google";
  if (model.startsWith("ideogram")) return "ideogram";
  return "unknown";
}

// Maps an aspect-ratio string to pixel dimensions. Shared by the Google
// and Ideogram providers (OpenAI takes an explicit "WxH" size instead).
export function aspectRatioToDimensions(ar: string): { width: number; height: number } {
  const map: Record<string, { width: number; height: number }> = {
    "1:1": { width: 1024, height: 1024 },
    "16:9": { width: 1408, height: 768 },
    "9:16": { width: 768, height: 1408 },
    "4:3": { width: 1280, height: 896 },
    "3:4": { width: 896, height: 1280 },
  };
  return map[ar] ?? map["1:1"]!;
}
