// Google Imagen 4 provider (via Google AI Studio / Generative Language API).
// Direct HTTP — same approach as the other image providers and the
// Gemini calls elsewhere in the codebase.

import type { ImageProviderResult } from "./types.js";
import { MODEL_COSTS, aspectRatioToDimensions } from "./types.js";

interface GoogleImagenResponse {
  predictions?: Array<{ bytesBase64Encoded?: string }>;
}

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

  const data = (await response.json()) as GoogleImagenResponse;
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("Google returned no image data");

  const dims = aspectRatioToDimensions(params.aspectRatio);
  return {
    imageData: Buffer.from(b64, "base64"),
    cost: MODEL_COSTS[params.model]!,
    ...dims,
  };
}
