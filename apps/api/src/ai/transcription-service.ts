/**
 * Transcription service — converts an audio or video file on disk into
 * plain markdown-formatted transcript text.
 *
 * Architecturally a sibling of ocr-service.ts: same shape (file path →
 * markdown), same fallback structure, same sanitize-on-exit treatment.
 * The two services exist separately because OCR uses image / `file`
 * content with vision prompts, while transcription uses audio / video
 * content with a transcription prompt — different system instructions,
 * different model preferences.
 *
 * Provider chain (TRANSCRIPTION_FALLBACK_ORDER):
 * 1. Gemini 2.0 Flash — primary. Audio + video natively via AI SDK
 *    file content type. ~20MB inline file cap.
 * 2. Sarvam Saarika — Indian-language-first ASR via direct HTTP. Strong
 *    on Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali, Marathi,
 *    Gujarati, Punjabi, Odia, Indian English. Audio only (no video).
 *    30MB file cap. Auth via SARVAM_API_KEY env.
 * 3. OpenAI Whisper — broad multilingual ASR (99 languages) via direct
 *    HTTP to /v1/audio/transcriptions. Audio only. 25MB file cap.
 *    Auth via OPENAI_API_KEY env. Last fallback because Sarvam wins on
 *    Indian-language accuracy for our audience, but Whisper has the
 *    most extensive vendor diversity story (different cloud, different
 *    billing pool).
 *
 * For large files / long videos either provider rejects, a follow-up
 * slice will need the Gemini File API or local audio extraction.
 */

import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { sanitizeOcrText } from "./text-sanitize.js";

export type TranscriptionModel = "gemini-2.0-flash" | "sarvam-saarika" | "openai-whisper";

export const TRANSCRIPTION_FALLBACK_ORDER: TranscriptionModel[] = [
  "gemini-2.0-flash",
  "sarvam-saarika",
  "openai-whisper",
];

// Per-model file size caps. Gemini takes files inline (20MB). Sarvam's
// saarika endpoint accepts up to 30MB. OpenAI's /audio/transcriptions
// endpoint caps at 25MB per request.
const GEMINI_INLINE_FILE_CAP_BYTES = 20 * 1024 * 1024;
const SARVAM_FILE_CAP_BYTES = 30 * 1024 * 1024;
const WHISPER_FILE_CAP_BYTES = 25 * 1024 * 1024;

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

function resolveGeminiModel(): ReturnType<typeof google> {
  return google("gemini-2.0-flash");
}

export type TranscriptionError =
  | { code: "FILE_TOO_LARGE"; provider: TranscriptionModel; sizeBytes: number; capBytes: number }
  | { code: "UNSUPPORTED_MEDIA"; provider: TranscriptionModel; mimeType: string }
  | { code: "MISSING_CREDENTIAL"; provider: TranscriptionModel; envVar: string }
  | { code: "PROVIDER_ERROR"; provider: TranscriptionModel; message: string }
  | { code: "ALL_PROVIDERS_FAILED"; attempts: Array<{ model: TranscriptionModel; error: string }> };

export class TranscriptionFailure extends Error {
  detail: TranscriptionError;
  constructor(detail: TranscriptionError) {
    super(
      detail.code === "FILE_TOO_LARGE"
        ? `File is ${(detail.sizeBytes / (1024 * 1024)).toFixed(1)}MB, max for ${detail.provider} is ${(detail.capBytes / (1024 * 1024)).toFixed(0)}MB`
        : detail.code === "UNSUPPORTED_MEDIA"
          ? `${detail.provider} does not support ${detail.mimeType}`
          : detail.code === "MISSING_CREDENTIAL"
            ? `${detail.provider} requires ${detail.envVar} (not set)`
            : detail.code === "PROVIDER_ERROR"
              ? `Transcription failed on ${detail.provider}: ${detail.message}`
              : `Transcription failed on all models: ${detail.attempts.map((a) => `${a.model}: ${a.error}`).join(" | ")}`,
    );
    this.name = "TranscriptionFailure";
    this.detail = detail;
  }
}

/**
 * Run transcription on a single audio/video file on disk via Gemini
 * 2.0 Flash. Throws `TranscriptionFailure` on rejection — callers fall
 * back via runTranscriptionWithFallback.
 */
async function runGeminiTranscription(
  filePath: string,
  mimeType: string,
): Promise<TranscriptionResult> {
  const fileStats = await stat(filePath);
  if (fileStats.size > GEMINI_INLINE_FILE_CAP_BYTES) {
    throw new TranscriptionFailure({
      code: "FILE_TOO_LARGE",
      provider: "gemini-2.0-flash",
      sizeBytes: fileStats.size,
      capBytes: GEMINI_INLINE_FILE_CAP_BYTES,
    });
  }

  const started = Date.now();
  const bytes = await readFile(filePath);
  const fileBytes = new Uint8Array(bytes);

  let response;
  try {
    response = await generateText({
      model: resolveGeminiModel(),
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
      provider: "gemini-2.0-flash",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const markdown = sanitizeOcrText(response.text);
  return {
    model: "gemini-2.0-flash",
    markdown,
    tokensIn: response.usage?.inputTokens,
    tokensOut: response.usage?.outputTokens,
    durationMs: Date.now() - started,
  };
}

/**
 * Run transcription via Sarvam Saarika (audio-only). Direct HTTP call —
 * Sarvam isn't in the Vercel AI SDK. Best on Indian languages but
 * doesn't accept video inputs.
 *
 * API ref: https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe
 */
async function runSarvamTranscription(
  filePath: string,
  mimeType: string,
): Promise<TranscriptionResult> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new TranscriptionFailure({
      code: "MISSING_CREDENTIAL",
      provider: "sarvam-saarika",
      envVar: "SARVAM_API_KEY",
    });
  }

  // Sarvam Saarika accepts audio formats only (wav, mp3, flac, ogg,
  // mpeg). Video files are out of scope for this provider — let the
  // fallback runner record the rejection and continue (or fail).
  if (!mimeType.startsWith("audio/")) {
    throw new TranscriptionFailure({
      code: "UNSUPPORTED_MEDIA",
      provider: "sarvam-saarika",
      mimeType,
    });
  }

  const fileStats = await stat(filePath);
  if (fileStats.size > SARVAM_FILE_CAP_BYTES) {
    throw new TranscriptionFailure({
      code: "FILE_TOO_LARGE",
      provider: "sarvam-saarika",
      sizeBytes: fileStats.size,
      capBytes: SARVAM_FILE_CAP_BYTES,
    });
  }

  const started = Date.now();
  const bytes = await readFile(filePath);
  const fileBlob = new Blob([new Uint8Array(bytes)], { type: mimeType });

  const fd = new FormData();
  fd.append("file", fileBlob, path.basename(filePath));
  // saarika:v2.5 is Sarvam's current best transcription model. v1 was
  // the prior generation.
  fd.append("model", "saarika:v2.5");
  // "unknown" tells Sarvam to auto-detect the language from audio.
  fd.append("language_code", "unknown");

  let response: Response;
  try {
    response = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": apiKey },
      body: fd,
    });
  } catch (err) {
    throw new TranscriptionFailure({
      code: "PROVIDER_ERROR",
      provider: "sarvam-saarika",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    throw new TranscriptionFailure({
      code: "PROVIDER_ERROR",
      provider: "sarvam-saarika",
      message: `HTTP ${response.status}: ${body.slice(0, 500)}`,
    });
  }

  const json = (await response.json().catch(() => null)) as {
    transcript?: string;
    language_code?: string;
  } | null;
  const transcript = json?.transcript ?? "";
  const markdown =
    transcript.trim().length > 0 ? sanitizeOcrText(transcript) : "(no speech detected)";

  return {
    model: "sarvam-saarika",
    markdown,
    // Sarvam doesn't return token counts — we leave them undefined so the
    // cost-attribution path knows there's nothing meaningful to record.
    durationMs: Date.now() - started,
  };
}

/**
 * Run transcription via OpenAI Whisper (audio-only). Direct HTTP call
 * to /v1/audio/transcriptions — same provider key we already use for
 * embeddings, gpt-4o OCR fallback, and the chat fallback.
 *
 * Whisper supports 99 languages with auto-detection. Strong baseline
 * for broad multilingual content but typically loses to Sarvam on
 * Indian-language accuracy, which is why it sits last in the chain.
 */
async function runWhisperTranscription(
  filePath: string,
  mimeType: string,
): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new TranscriptionFailure({
      code: "MISSING_CREDENTIAL",
      provider: "openai-whisper",
      envVar: "OPENAI_API_KEY",
    });
  }

  // Whisper accepts audio formats only: flac, m4a, mp3, mp4, mpeg,
  // mpga, oga, ogg, wav, webm. (mp4 here means audio-only mp4
  // container; video mp4 will return an error.) Reject video early so
  // we don't burn a request on something we know won't work.
  if (!mimeType.startsWith("audio/")) {
    throw new TranscriptionFailure({
      code: "UNSUPPORTED_MEDIA",
      provider: "openai-whisper",
      mimeType,
    });
  }

  const fileStats = await stat(filePath);
  if (fileStats.size > WHISPER_FILE_CAP_BYTES) {
    throw new TranscriptionFailure({
      code: "FILE_TOO_LARGE",
      provider: "openai-whisper",
      sizeBytes: fileStats.size,
      capBytes: WHISPER_FILE_CAP_BYTES,
    });
  }

  const started = Date.now();
  const bytes = await readFile(filePath);
  const fileBlob = new Blob([new Uint8Array(bytes)], { type: mimeType });

  const fd = new FormData();
  fd.append("file", fileBlob, path.basename(filePath));
  fd.append("model", "whisper-1");
  // No `language` param → Whisper auto-detects, same posture as Sarvam.
  // No `prompt` either — keep output neutral.
  fd.append("response_format", "json");

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });
  } catch (err) {
    throw new TranscriptionFailure({
      code: "PROVIDER_ERROR",
      provider: "openai-whisper",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    throw new TranscriptionFailure({
      code: "PROVIDER_ERROR",
      provider: "openai-whisper",
      message: `HTTP ${response.status}: ${body.slice(0, 500)}`,
    });
  }

  const json = (await response.json().catch(() => null)) as { text?: string } | null;
  const transcript = json?.text ?? "";
  const markdown =
    transcript.trim().length > 0 ? sanitizeOcrText(transcript) : "(no speech detected)";

  return {
    model: "openai-whisper",
    markdown,
    // Whisper bills per-second of audio, not by tokens, so we leave
    // token counts undefined. durationMs captures wall-clock latency.
    durationMs: Date.now() - started,
  };
}

/**
 * Dispatch to the right provider implementation. Each implementation
 * is responsible for its own size / media-type checks since the
 * constraints differ per provider.
 */
export async function runTranscriptionOnFile(
  filePath: string,
  mimeType: string,
  model: TranscriptionModel,
): Promise<TranscriptionResult> {
  switch (model) {
    case "gemini-2.0-flash":
      return runGeminiTranscription(filePath, mimeType);
    case "sarvam-saarika":
      return runSarvamTranscription(filePath, mimeType);
    case "openai-whisper":
      return runWhisperTranscription(filePath, mimeType);
  }
}

/**
 * Try the preferred model first, then fall through the rest of
 * TRANSCRIPTION_FALLBACK_ORDER. Throws TranscriptionFailure (code
 * `ALL_PROVIDERS_FAILED`) only when every model rejects.
 *
 * Per-model failures (FILE_TOO_LARGE, UNSUPPORTED_MEDIA,
 * MISSING_CREDENTIAL, PROVIDER_ERROR) are all treated as "try the next
 * model". This is the right call when providers have different
 * capabilities: e.g. Sarvam can't handle video so it returns
 * UNSUPPORTED_MEDIA, and we should keep trying. But it means if Sarvam
 * is the last entry and gets called on a video, the final error
 * message will be "all providers failed" rather than a clean
 * "video not supported" — the caller can inspect the attempts array
 * to surface a friendlier message.
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
      const result = await runTranscriptionOnFile(filePath, mimeType, model);
      if (attempts.length > 0) {
        console.warn(
          `[transcription] ${model} succeeded after ${attempts.length} failed attempt(s):`,
          attempts.map((a) => `${a.model}: ${a.error}`).join(" | "),
        );
      }
      return result;
    } catch (err) {
      attempts.push({
        model,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw new TranscriptionFailure({ code: "ALL_PROVIDERS_FAILED", attempts });
}
