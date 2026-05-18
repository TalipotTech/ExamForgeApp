/**
 * Sarvam Saarika Batch API integration.
 *
 * The sync /speech-to-text endpoint caps audio at 30 seconds. For
 * lecture-length recordings (the typical ExamForge upload) we need
 * Sarvam's batch flow:
 *
 *   1. POST /speech-to-text/job/init with the model + language_code in
 *      the body
 *        → returns { job_id, input_storage_path, output_storage_path }.
 *          The storage paths are Azure Blob SAS URLs valid for hours.
 *   2. PUT the audio file to input_storage_path (Azure REST,
 *      `x-ms-blob-type: BlockBlob`).
 *   3. GET /speech-to-text/job/{job_id}/status until job_state is
 *      "Completed" or "Failed". Backoff 5s → 10s → 15s up to a 5-minute
 *      ceiling. (No explicit start step — Sarvam auto-runs once the
 *      audio lands in the input SAS container.)
 *   4. List files under output_storage_path; each input audio produces
 *      a JSON output file with the transcript.
 *
 * The BullMQ worker holds its job slot for the duration of the poll
 * loop. Concurrency=2 on the transcription worker means two long jobs
 * can be in flight simultaneously; for higher volume bump concurrency
 * or split this into a separate batch-poll queue with delayed jobs.
 *
 * Architectural sibling of transcription-service.ts — both surface
 * `runX(filePath, mimeType, language?) → TranscriptionResult` so the
 * fallback runner can dispatch on the TranscriptionModel union.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { sanitizeOcrText } from "./text-sanitize.js";

const SARVAM_BATCH_JOB_INIT = "https://api.sarvam.ai/speech-to-text/job/init";
const SARVAM_BATCH_JOB_BASE = "https://api.sarvam.ai/speech-to-text/job";

// Sarvam's batch endpoint is documented to accept much larger files
// than the 30MB sync limit; cap at 500MB as a sanity guard so we don't
// pump a runaway upload through.
const SARVAM_BATCH_FILE_CAP_BYTES = 500 * 1024 * 1024;

// Poll cadence — start tight (most short-ish lectures complete in <1
// minute), back off to avoid hammering. 5-minute overall ceiling; jobs
// that exceed it almost certainly mean Sarvam-side trouble.
const POLL_DELAYS_MS = [
  5_000, 5_000, 5_000, 10_000, 10_000, 15_000, 15_000, 15_000, 15_000, 15_000,
];
const POLL_CEILING_MS = 5 * 60 * 1000;

const SARVAM_SUPPORTED_LANGS_FOR_BATCH = new Set([
  "hi",
  "ta",
  "ml",
  "te",
  "kn",
  "bn",
  "mr",
  "gu",
  "pa",
  "or",
  "en",
]);

type BatchInitResponse = {
  job_id?: string;
  input_storage_path?: string;
  output_storage_path?: string;
};

type BatchStatusResponse = {
  job_state?: string;
  // Sarvam sometimes returns extra fields; we tolerate any extras.
};

type BatchTranscriptResult = {
  transcript: string;
  /** Provider-attributed language code, when Sarvam echoes it. */
  languageCode?: string;
  /** Total wall-clock spent on the whole submit→poll→fetch dance. */
  durationMs: number;
};

export type BatchTranscriptionFailure =
  | { code: "MISSING_CREDENTIAL"; envVar: "SARVAM_API_KEY" }
  | { code: "FILE_TOO_LARGE"; sizeBytes: number; capBytes: number }
  | { code: "UNSUPPORTED_MEDIA"; mimeType: string }
  | { code: "UNSUPPORTED_LANGUAGE"; language: string }
  | { code: "INIT_FAILED"; status: number; body: string }
  | { code: "UPLOAD_FAILED"; status: number; body: string }
  | { code: "START_FAILED"; status: number; body: string }
  | { code: "POLL_FAILED"; status: number; body: string }
  | { code: "JOB_FAILED"; state: string }
  | { code: "POLL_TIMEOUT"; lastState: string }
  | { code: "OUTPUT_FETCH_FAILED"; status?: number; message: string }
  | { code: "EMPTY_TRANSCRIPT" };

export class SarvamBatchFailure extends Error {
  detail: BatchTranscriptionFailure;
  constructor(detail: BatchTranscriptionFailure) {
    super(formatBatchFailure(detail));
    this.name = "SarvamBatchFailure";
    this.detail = detail;
  }
}

function formatBatchFailure(d: BatchTranscriptionFailure): string {
  switch (d.code) {
    case "MISSING_CREDENTIAL":
      return `Sarvam batch requires ${d.envVar} (not set)`;
    case "FILE_TOO_LARGE":
      return `File is ${(d.sizeBytes / (1024 * 1024)).toFixed(1)}MB, batch cap ${(d.capBytes / (1024 * 1024)).toFixed(0)}MB`;
    case "UNSUPPORTED_MEDIA":
      return `Sarvam batch does not support ${d.mimeType}`;
    case "UNSUPPORTED_LANGUAGE":
      return `Sarvam batch does not support language "${d.language}"`;
    case "INIT_FAILED":
      return `Sarvam batch init failed: HTTP ${d.status} ${d.body.slice(0, 200)}`;
    case "UPLOAD_FAILED":
      return `Sarvam batch upload failed: HTTP ${d.status} ${d.body.slice(0, 200)}`;
    case "START_FAILED":
      return `Sarvam batch start failed: HTTP ${d.status} ${d.body.slice(0, 200)}`;
    case "POLL_FAILED":
      return `Sarvam batch poll failed: HTTP ${d.status} ${d.body.slice(0, 200)}`;
    case "JOB_FAILED":
      return `Sarvam batch job state=${d.state}`;
    case "POLL_TIMEOUT":
      return `Sarvam batch timed out (last state=${d.lastState}, ceiling=${POLL_CEILING_MS}ms)`;
    case "OUTPUT_FETCH_FAILED":
      return `Sarvam batch output fetch failed${d.status ? `: HTTP ${d.status}` : ""}: ${d.message}`;
    case "EMPTY_TRANSCRIPT":
      return "Sarvam batch returned an empty transcript";
  }
}

function authHeader(apiKey: string): HeadersInit {
  return { "api-subscription-key": apiKey };
}

/** Step 1 — ask Sarvam for a job id + Azure SAS URLs, with the
 *  transcription config attached so the job auto-runs once we upload
 *  the audio. The earlier version of this code POSTed to a separate
 *  /{job_id}/start endpoint after upload, but that path returned 404
 *  — Sarvam's batch API processes automatically once input lands in
 *  the SAS container. Config in init is the consistent shape. */
async function initJob(
  apiKey: string,
  languageCode: string,
): Promise<{
  jobId: string;
  inputStoragePath: string;
  outputStoragePath: string;
}> {
  const res = await fetch(SARVAM_BATCH_JOB_INIT, {
    method: "POST",
    headers: { ...authHeader(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({
      language_code: languageCode,
      model: "saarika:v2.5",
      with_timestamps: false,
      with_diarization: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new SarvamBatchFailure({ code: "INIT_FAILED", status: res.status, body });
  }
  const json = (await res.json().catch(() => null)) as BatchInitResponse | null;
  if (!json?.job_id || !json.input_storage_path || !json.output_storage_path) {
    throw new SarvamBatchFailure({
      code: "INIT_FAILED",
      status: res.status,
      body: `Unexpected init response: ${JSON.stringify(json)}`,
    });
  }
  // Log the FULL init response (with SAS query strings redacted) so we
  // can see any hint fields Sarvam returns beyond the three we know
  // about — e.g. a `start_url`, expected file name, or initial state
  // worth poking at.
  console.log(`[sarvam-batch] init OK full response: ${JSON.stringify(redactSasInValue(json))}`);
  return {
    jobId: json.job_id,
    inputStoragePath: json.input_storage_path,
    outputStoragePath: json.output_storage_path,
  };
}

/** Mask SAS query strings in any string-valued field of an object so
 *  the logs don't leak short-lived credentials. */
function redactSasInValue(v: unknown): unknown {
  if (typeof v === "string") {
    const qIdx = v.indexOf("?");
    return qIdx >= 0 && v.includes("sig=") ? `${v.slice(0, qIdx)}?<sas-redacted>` : v;
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = redactSasInValue(val);
    return out;
  }
  if (Array.isArray(v)) return v.map((x) => redactSasInValue(x));
  return v;
}

/** Step 2 — PUT the audio bytes to a blob inside the container SAS URL
 *  init returned. The path ends with `/inputs?{sas}` — a CONTAINER, not
 *  a blob — so we append the filename before the query string to
 *  produce `/inputs/<name>?{sas}`.
 *
 *  Earlier revision experimented with PUTting to the container URL
 *  directly; Azure rejects with HTTP 409 OperationNotAllowedInCurrentState
 *  because container-level PUT means create-or-set-properties, not
 *  blob upload. The filename-appended path is correct. */
async function uploadFile(
  inputStoragePath: string,
  filePath: string,
  mimeType: string,
): Promise<void> {
  const fileBuffer = await readFile(filePath);
  const fileName = path.basename(filePath);
  const targetUrl = appendFileNameToSasUrl(inputStoragePath, fileName);
  console.log(
    `[sarvam-batch] PUT upload → ${targetUrl.split("?")[0]}? (${fileBuffer.byteLength} bytes, ${mimeType})`,
  );

  const res = await fetch(targetUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": mimeType,
    },
    body: new Uint8Array(fileBuffer),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new SarvamBatchFailure({ code: "UPLOAD_FAILED", status: res.status, body });
  }
  console.log(`[sarvam-batch] upload OK status=${res.status}`);
}

function appendFileNameToSasUrl(sasUrl: string, fileName: string): string {
  // Split off the query string, append "/<fileName>" to the path, re-add
  // the query. Idempotent if the SAS URL already includes a filename.
  const qIdx = sasUrl.indexOf("?");
  const path_ = qIdx >= 0 ? sasUrl.slice(0, qIdx) : sasUrl;
  const query = qIdx >= 0 ? sasUrl.slice(qIdx) : "";
  // Don't double-append if Sarvam already gave us a fully-qualified
  // blob path.
  if (path_.endsWith(`/${fileName}`)) return sasUrl;
  // Strip a possible trailing slash before joining.
  const cleanPath = path_.endsWith("/") ? path_.slice(0, -1) : path_;
  return `${cleanPath}/${encodeURIComponent(fileName)}${query}`;
}

/** Step 3 — kick the job. Sarvam's batch API has an explicit start
 *  step that we need to call after the file is uploaded. The earlier
 *  revision's 404 from POST /speech-to-text/job/{job_id}/start happened
 *  BEFORE we had a valid upload — the previous error may have been
 *  Sarvam refusing to start a job with no input rather than the path
 *  being wrong. Try the documented path again now that upload is fixed.
 *
 *  If Sarvam responds with a non-404 error, the body comes through in
 *  START_FAILED so we can adjust the path or payload from the message. */
async function startJob(apiKey: string, jobId: string): Promise<void> {
  const startUrl = `${SARVAM_BATCH_JOB_BASE}/${encodeURIComponent(jobId)}/start`;
  console.log(`[sarvam-batch] POST start → ${startUrl}`);
  const res = await fetch(startUrl, {
    method: "POST",
    headers: { ...authHeader(apiKey), "Content-Type": "application/json" },
    // Sarvam might accept an empty body since config was already
    // attached at init. Sending {} so the content-type is honoured.
    body: "{}",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new SarvamBatchFailure({ code: "START_FAILED", status: res.status, body });
  }
  console.log(`[sarvam-batch] start OK status=${res.status}`);
}

/** Step 4 — poll until completion or timeout. */
async function pollUntilDone(apiKey: string, jobId: string): Promise<string /* terminal state */> {
  const started = Date.now();
  let lastState = "Unknown";
  let attempt = 0;
  while (Date.now() - started < POLL_CEILING_MS) {
    const delay = POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)] ?? 15_000;
    await new Promise((r) => setTimeout(r, delay));
    attempt++;

    const res = await fetch(`${SARVAM_BATCH_JOB_BASE}/${encodeURIComponent(jobId)}/status`, {
      method: "GET",
      headers: authHeader(apiKey),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "(no body)");
      throw new SarvamBatchFailure({ code: "POLL_FAILED", status: res.status, body });
    }
    const json = (await res.json().catch(() => null)) as BatchStatusResponse | null;
    const newState = json?.job_state ?? lastState;
    if (newState !== lastState) {
      console.log(
        `[sarvam-batch] job ${jobId} state transition ${lastState} → ${newState} (attempt ${attempt}, +${Math.round((Date.now() - started) / 1000)}s)`,
      );
      lastState = newState;
    }

    if (lastState === "Completed") return lastState;
    if (lastState === "Failed") {
      throw new SarvamBatchFailure({ code: "JOB_FAILED", state: lastState });
    }
    // Otherwise (Queued / Running / Accepted / etc.) keep polling.
  }
  throw new SarvamBatchFailure({ code: "POLL_TIMEOUT", lastState });
}

/** Step 5 — fetch the output blob and pluck the transcript out. */
async function fetchTranscript(outputStoragePath: string): Promise<{
  transcript: string;
  languageCode?: string;
}> {
  // Sarvam's batch output is one JSON file per input audio file, named
  // `<originalName>.json`. We don't know the input name here from the
  // URL alone, so we try a couple of strategies:
  //   1. If output_storage_path is already a fully-qualified blob URL
  //      ending in .json, GET it directly.
  //   2. Otherwise, list the container via the Azure blob list API
  //      (?restype=container&comp=list) and download the first .json
  //      we find.
  // Listing requires the SAS URL to carry list permission ("rl");
  // Sarvam-provisioned SAS URLs typically do.
  if (/\.json(\?|$)/.test(outputStoragePath)) {
    const blobRes = await fetch(outputStoragePath, { method: "GET" });
    if (!blobRes.ok) {
      throw new SarvamBatchFailure({
        code: "OUTPUT_FETCH_FAILED",
        status: blobRes.status,
        message: await blobRes.text().catch(() => "(no body)"),
      });
    }
    return parseTranscriptJson(await blobRes.text());
  }

  const listUrl = withQueryAppended(outputStoragePath, "restype=container&comp=list");
  const listRes = await fetch(listUrl, { method: "GET" });
  if (!listRes.ok) {
    throw new SarvamBatchFailure({
      code: "OUTPUT_FETCH_FAILED",
      status: listRes.status,
      message: await listRes.text().catch(() => "(no body)"),
    });
  }
  const xml = await listRes.text();
  // Minimal extraction — find the first <Name>...</Name> ending in .json.
  // Avoid pulling an XML parser dep for one pattern.
  const match = xml.match(/<Name>([^<]+\.json)<\/Name>/);
  if (!match) {
    throw new SarvamBatchFailure({
      code: "OUTPUT_FETCH_FAILED",
      message: "No .json output blob found in container listing",
    });
  }
  const blobName = match[1]!;
  // Build the blob URL by inserting the blob name before the SAS query.
  const blobUrl = appendFileNameToSasUrl(outputStoragePath, blobName);
  const blobRes = await fetch(blobUrl, { method: "GET" });
  if (!blobRes.ok) {
    throw new SarvamBatchFailure({
      code: "OUTPUT_FETCH_FAILED",
      status: blobRes.status,
      message: await blobRes.text().catch(() => "(no body)"),
    });
  }
  return parseTranscriptJson(await blobRes.text());
}

function withQueryAppended(url: string, extra: string): string {
  return url.includes("?") ? `${url}&${extra}` : `${url}?${extra}`;
}

function parseTranscriptJson(raw: string): { transcript: string; languageCode?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { transcript: raw }; // Sometimes Sarvam stores plain text.
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const transcript =
      (typeof obj.transcript === "string" && obj.transcript) ||
      (typeof obj.text === "string" && obj.text) ||
      "";
    const languageCode = typeof obj.language_code === "string" ? obj.language_code : undefined;
    return { transcript, languageCode };
  }
  return { transcript: "" };
}

/** End-to-end batch transcription: init → upload → start → poll → fetch.
 *  Surfaced through the public service module via the
 *  `sarvam-saarika-batch` TranscriptionModel identifier. */
export async function runSarvamBatchTranscription(
  filePath: string,
  mimeType: string,
  language: string | undefined,
): Promise<BatchTranscriptResult> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new SarvamBatchFailure({ code: "MISSING_CREDENTIAL", envVar: "SARVAM_API_KEY" });
  }
  if (!mimeType.startsWith("audio/")) {
    throw new SarvamBatchFailure({ code: "UNSUPPORTED_MEDIA", mimeType });
  }

  const normalised = language?.trim().toLowerCase().replace(/-in$/, "");
  if (!normalised || !SARVAM_SUPPORTED_LANGS_FOR_BATCH.has(normalised)) {
    // Sarvam batch requires an explicit language_code at job start —
    // there's no auto-detect equivalent on the batch endpoint as of
    // writing. So if we don't have a usable hint, fail UNSUPPORTED.
    throw new SarvamBatchFailure({
      code: "UNSUPPORTED_LANGUAGE",
      language: normalised ?? "unknown",
    });
  }

  const fileStats = await stat(filePath);
  if (fileStats.size > SARVAM_BATCH_FILE_CAP_BYTES) {
    throw new SarvamBatchFailure({
      code: "FILE_TOO_LARGE",
      sizeBytes: fileStats.size,
      capBytes: SARVAM_BATCH_FILE_CAP_BYTES,
    });
  }

  const started = Date.now();
  const { jobId, inputStoragePath, outputStoragePath } = await initJob(apiKey, `${normalised}-IN`);
  await uploadFile(inputStoragePath, filePath, mimeType);
  await startJob(apiKey, jobId);
  await pollUntilDone(apiKey, jobId);
  const { transcript } = await fetchTranscript(outputStoragePath);
  const trimmed = transcript.trim();
  if (trimmed.length === 0) {
    throw new SarvamBatchFailure({ code: "EMPTY_TRANSCRIPT" });
  }
  return {
    transcript: sanitizeOcrText(trimmed),
    durationMs: Date.now() - started,
  };
}
