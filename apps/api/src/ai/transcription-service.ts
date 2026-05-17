/**
 * Transcription service — converts an audio or video file on disk into
 * plain markdown-formatted transcript text using Gemini 2.0 Flash (which
 * accepts audio and video natively via the AI SDK `file` content type).
 *
 * Architecturally a sibling of ocr-service.ts: same shape (file path →
 * markdown), same fallback structure, same sanitize-on-exit treatment.
 * The two services exist separately because OCR uses image / `file`
 * content with vision prompts, while transcription uses audio / video
 * content with a transcription prompt — different system instructions,
 * different model preferences.
 *
 * v1 scope:
 * - Gemini 2.0 Flash only. No Whisper fallback yet — that's tracked as a
 *   follow-up. When Gemini fails, the worker reports the error to the
 *   media-item row and the UI surfaces it.
 * - Inline file upload. Gemini's inline file budget is ~20MB; files over
 *   that limit will be rejected up-front before we burn provider quota.
 *   Large files (full-length lecture videos) will need a follow-up
 *   slice that uses the Gemini File API or audio extraction.
 */

import { readFile, stat } from "node:fs/promises";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { sanitizeOcrText } from "./text-sanitize.js";

export type TranscriptionModel = "gemini-2.0-flash";

export const TRANSCRIPTION_FALLBACK_ORDER: TranscriptionModel[] = ["gemini-2.0-flash"];

// Gemini accepts files up to ~20MB inline through the file content type.
// Beyond that we'd need the File API (separate upload, then reference by
// URI) — out of scope for v1. We reject early so the user gets a clear
// error rather than a confusing provider rejection.
const INLINE_FILE_CAP_BYTES = 20 * 1024 * 1024;

export type TranscriptionResult = {
  model: TranscriptionModel;
  markdown: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs: number;
};

const TRANSCRIPTION_SYSTEM_PROMPT = `You are an expert transcription assistant for educational content in Indian competitive-exam contexts.

Your job: take an audio or video file and produce a faithful written transcript in well-formed Markdown.

Transcription rules:
- Capture all spoken words verbatim. Do not paraphrase, summarise, or correct grammar.
- Preserve speaker identity when distinguishable. Use "**Speaker 1:**", "**Speaker 2:**", etc. for multiple speakers, or omit the prefix entirely for single-speaker audio.
- For technical content (definitions, formulas, mnemonics, lecture notes), use Markdown structure to make the result readable: # / ## headings if the speaker explicitly announces section transitions; bullet lists for enumerated points; LaTeX ($...$) for formulas the speaker dictates.
- Mark unintelligible sections as "[inaudible]" — do not guess.
- For Hindi, Malayalam, Tamil, Telugu, Kannada speech: transcribe in the original script verbatim. Do NOT translate.
- Do NOT add commentary, summary, or meta-text. Output only the transcript.

Whitespace constraints:
- Use a single space between words and one blank line between paragraphs / speaker turns. Nothing else.
- Do NOT emit HTML entities like &nbsp;.
- Do NOT pad with whitespace.

Output constraints:
- Respond with Markdown only — no code-fence wrapper around the full response.
- If the audio contains no intelligible speech, respond with exactly: "(no speech detected)"`;

function resolveModel(model: TranscriptionModel): ReturnType<typeof google> {
  switch (model) {
    case "gemini-2.0-flash":
      return google("gemini-2.0-flash");
  }
}

export type TranscriptionError =
  | { code: "FILE_TOO_LARGE"; sizeBytes: number; capBytes: number }
  | { code: "PROVIDER_ERROR"; provider: TranscriptionModel; message: string }
  | { code: "ALL_PROVIDERS_FAILED"; attempts: Array<{ model: TranscriptionModel; error: string }> };

export class TranscriptionFailure extends Error {
  detail: TranscriptionError;
  constructor(detail: TranscriptionError) {
    super(
      detail.code === "FILE_TOO_LARGE"
        ? `File is ${(detail.sizeBytes / (1024 * 1024)).toFixed(1)}MB, max inline transcription size is ${(detail.capBytes / (1024 * 1024)).toFixed(0)}MB`
        : detail.code === "PROVIDER_ERROR"
          ? `Transcription failed on ${detail.provider}: ${detail.message}`
          : `Transcription failed on all models: ${detail.attempts.map((a) => `${a.model}: ${a.error}`).join(" | ")}`,
    );
    this.name = "TranscriptionFailure";
    this.detail = detail;
  }
}

/**
 * Run transcription on a single audio/video file on disk. Throws
 * `TranscriptionFailure` on rejection — callers fall back via
 * runTranscriptionWithFallback.
 */
export async function runTranscriptionOnFile(
  filePath: string,
  mimeType: string,
  model: TranscriptionModel,
): Promise<TranscriptionResult> {
  const fileStats = await stat(filePath);
  if (fileStats.size > INLINE_FILE_CAP_BYTES) {
    throw new TranscriptionFailure({
      code: "FILE_TOO_LARGE",
      sizeBytes: fileStats.size,
      capBytes: INLINE_FILE_CAP_BYTES,
    });
  }

  const started = Date.now();
  const bytes = await readFile(filePath);
  const fileBytes = new Uint8Array(bytes);

  let response;
  try {
    response = await generateText({
      model: resolveModel(model),
      system: TRANSCRIPTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe this file per the system instructions.",
            },
            { type: "file", data: fileBytes, mediaType: mimeType },
          ],
        },
      ],
      temperature: 0,
      // Long-form lectures can be many thousands of tokens of transcript.
      // Same upper-bound reasoning as the document OCR path.
      maxOutputTokens: 32768,
    });
  } catch (err) {
    throw new TranscriptionFailure({
      code: "PROVIDER_ERROR",
      provider: model,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const markdown = sanitizeOcrText(response.text);
  return {
    model,
    markdown,
    tokensIn: response.usage?.inputTokens,
    tokensOut: response.usage?.outputTokens,
    durationMs: Date.now() - started,
  };
}

/**
 * Try the preferred model first, then fall through the rest of
 * TRANSCRIPTION_FALLBACK_ORDER. Throws TranscriptionFailure (code
 * `ALL_PROVIDERS_FAILED`) only when every model rejects.
 */
export async function runTranscriptionWithFallback(
  filePath: string,
  mimeType: string,
  preferred: TranscriptionModel,
): Promise<TranscriptionResult> {
  const order: TranscriptionModel[] = [
    preferred,
    ...TRANSCRIPTION_FALLBACK_ORDER.filter((m) => m !== preferred),
  ];
  const attempts: Array<{ model: TranscriptionModel; error: string }> = [];
  for (const model of order) {
    try {
      return await runTranscriptionOnFile(filePath, mimeType, model);
    } catch (err) {
      // FILE_TOO_LARGE isn't fixable by trying a different model — stop
      // and surface it immediately.
      if (err instanceof TranscriptionFailure && err.detail.code === "FILE_TOO_LARGE") {
        throw err;
      }
      attempts.push({
        model,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw new TranscriptionFailure({ code: "ALL_PROVIDERS_FAILED", attempts });
}
