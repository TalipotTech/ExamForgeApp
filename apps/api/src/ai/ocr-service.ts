/**
 * OCR service — extract markdown-formatted text from an image using
 * Claude Vision or Gemini Vision via the Vercel AI SDK. Provider is
 * picked by the caller (`claude-sonnet-4-6`, `gemini-2.5-pro`, or
 * `gemini-2.5-flash`) so creators can trade off quality / latency /
 * cost per upload.
 *
 * Intentionally isolated from the rest of ai-router.ts — the existing
 * router is text-only; this module owns image-in/text-out. Failures are
 * typed so the worker can retry with a fallback model.
 */

import { readFile } from "node:fs/promises";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

export type OcrModel = "claude-sonnet-4-6" | "gemini-2.5-pro" | "gemini-2.5-flash";

export const OCR_MODEL_IDS: OcrModel[] = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "claude-sonnet-4-6",
];

export const OCR_FALLBACK_ORDER: OcrModel[] = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "claude-sonnet-4-6",
];

export type OcrResult = {
  model: OcrModel;
  markdown: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs: number;
};

const OCR_SYSTEM_PROMPT = `You are an expert OCR and document-structuring assistant for educational content in Indian competitive-exam contexts.

Extract ALL text from the image and return well-formed Markdown. Preserve:
- Headings → # / ## / ### based on visual hierarchy
- Bullet lists and numbered lists
- Tables → GFM markdown tables
- Formulas → inline / display LaTeX ($...$ and $$...$$)
- Code / pseudocode → fenced code blocks
- Diagrams → wrap a concise description in > quote blocks prefixed with "Diagram:"
- Margin notes / callouts → wrap in > quote blocks prefixed with "Note:"
- Multi-column layouts → linearise left-to-right, top-to-bottom

Language handling:
- If the text is in Hindi, Malayalam, Tamil, Telugu, or Kannada, preserve the original script verbatim
- Do NOT translate
- Do NOT add explanations, commentary, or meta-text — output only the extracted content

Output constraints:
- Respond with Markdown only — no code-fence wrapper around the full response
- If the image contains no meaningful text, respond with exactly: "(no text extracted)"`;

function resolveModel(model: OcrModel): ReturnType<typeof anthropic> | ReturnType<typeof google> {
  switch (model) {
    case "claude-sonnet-4-6":
      return anthropic("claude-sonnet-4-5-20250929");
    case "gemini-2.5-pro":
      return google("gemini-2.5-pro");
    case "gemini-2.5-flash":
      return google("gemini-2.5-flash");
  }
}

/**
 * Run OCR on a single image file on disk. Returns the extracted markdown
 * plus token usage metrics. Throws if the provider rejects the request;
 * callers are expected to catch + fall back to a different model.
 */
export async function runOcrOnImage(
  imagePath: string,
  mimeType: string,
  model: OcrModel,
): Promise<OcrResult> {
  const started = Date.now();
  const bytes = await readFile(imagePath);
  const dataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;

  const result = await generateText({
    model: resolveModel(model),
    system: OCR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract all text from this image and format it as Markdown per the system instructions.",
          },
          { type: "image", image: dataUrl },
        ],
      },
    ],
    temperature: 0,
    maxOutputTokens: 4096,
  });

  const markdown = result.text.trim();
  return {
    model,
    markdown,
    tokensIn: result.usage?.inputTokens,
    tokensOut: result.usage?.outputTokens,
    durationMs: Date.now() - started,
  };
}

/**
 * Run OCR with automatic fallback to the next model in the default order
 * when the primary fails (auth errors, rate limits, refusals). Returns the
 * first successful result. Throws only if every model fails.
 */
export async function runOcrWithFallback(
  imagePath: string,
  mimeType: string,
  preferred: OcrModel,
): Promise<OcrResult> {
  const order: OcrModel[] = [preferred, ...OCR_FALLBACK_ORDER.filter((m) => m !== preferred)];
  const errors: Array<{ model: OcrModel; error: string }> = [];
  for (const model of order) {
    try {
      return await runOcrOnImage(imagePath, mimeType, model);
    } catch (err) {
      errors.push({
        model,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw new Error(
    `OCR failed on all models: ${errors.map((e) => `${e.model}: ${e.error}`).join(" | ")}`,
  );
}
