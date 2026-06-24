// OpenAI GPT Image provider.
//
// The repo does not depend on the `openai` SDK package — text AI goes
// through the Vercel AI SDK (@ai-sdk/openai) and direct OpenAI calls
// (e.g. Whisper in transcription-service.ts) are made over plain HTTP.
// We follow that same pattern here: a direct POST to the images API.
// gpt-image-* models return base64 image data by default (no
// response_format needed).

import type { ImageProviderResult } from "./types.js";
import { MODEL_COSTS } from "./types.js";

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: string }>;
}

export async function generateWithOpenAI(params: {
  model: "gpt-image-1.5" | "gpt-image-1" | "gpt-image-1-mini";
  prompt: string;
  size: string; // "1024x1024" | "1536x1024" | "1024x1536"
  quality: "low" | "medium" | "high";
}): Promise<ImageProviderResult> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      n: 1,
      size: params.size,
      quality: params.quality,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI image error: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as OpenAIImageResponse;
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data");

  const [width, height] = params.size.split("x").map(Number);
  return {
    imageData: Buffer.from(b64, "base64"),
    cost: MODEL_COSTS[params.model]!,
    width: width ?? 1024,
    height: height ?? 1024,
  };
}
