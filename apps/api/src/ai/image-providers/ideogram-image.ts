// Ideogram 3.0 provider — best for text-heavy images (formula cards,
// infographics, labels). Direct HTTP. Ideogram returns a URL to the
// generated image, so we fetch the bytes in a second request.

import type { ImageProviderResult } from "./types.js";
import { MODEL_COSTS, aspectRatioToDimensions } from "./types.js";

interface IdeogramResponse {
  data?: Array<{ url?: string }>;
}

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
      "Api-Key": process.env.IDEOGRAM_API_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_request: {
        prompt: params.prompt,
        aspect_ratio: arMap[params.aspectRatio] ?? "ASPECT_1_1",
        model: "V_3",
        magic_prompt_option: "AUTO",
        style_type: params.style === "realistic" ? "REALISTIC" : "DESIGN",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ideogram error: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as IdeogramResponse;
  const imageUrl = data.data?.[0]?.url;
  if (!imageUrl) throw new Error("Ideogram returned no image URL");

  // Ideogram returns a URL — fetch the actual image bytes.
  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) {
    throw new Error(`Ideogram image fetch failed: ${imgResponse.status}`);
  }
  const imageData = Buffer.from(await imgResponse.arrayBuffer());

  const dims = aspectRatioToDimensions(params.aspectRatio);
  return {
    imageData,
    cost: MODEL_COSTS["ideogram-3.0"]!,
    ...dims,
  };
}
