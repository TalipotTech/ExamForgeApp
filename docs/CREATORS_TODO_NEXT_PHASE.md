# Creators Ecosystem — TODO (Next Phase)

> **As of 2026-06-22.** All four creator build slices (promotions admin,
> analytics dashboard, subscription-pool worker, public directory) are built
> **and merged** into `creators-feature`. Live sessions and the AI-tutor RAG
> core also shipped. What remains are the AI-tutor multimedia follow-ups from
> `.claude/plans/next-session-prompts.md` §7 — deliberately deferred. Each is
> independent.
>
> Branch convention unchanged: work in `feat/*` off `creators-feature`,
> squash/no-ff merge back. Don't start the dev server from Claude Code (see
> `.claude/rules/dev-workflow.md`).

---

## Priority queue

| #   | Item                                      | Type       | Status                                  |
| --- | ----------------------------------------- | ---------- | --------------------------------------- |
| 7a  | Large-file video transcription            | Code       | **TODO — next phase**                   |
| 7c  | Auto-extract OCR/transcription on publish | Code       | **TODO — next phase**                   |
| 7b  | Sarvam batch — live validation            | Validation | Pending (service wired, never live-run) |
| 7d  | Gemini billing / quota                    | Ops        | Standing reminder (no code)             |

---

## 7a. Video transcription (large files) — TODO

**Problem:** audio + PDF transcribe/extract fine, but video can't. A ~424MB
lecture mp4 fails on every provider — Gemini's inline `file` content caps at
20MB, and Sarvam/Whisper don't accept video at all. The error surfaces cleanly
on the media row; this is a missing capability, not a bug.

**Pick one path (a deployment-dependency call):**

- **Gemini File API** — upload the video to Gemini's File API (up to 2GB,
  stored 48h), transcribe by URI instead of inline bytes. No new system
  dependency, video-native, single call. Gemini-only (no fallback — but
  Sarvam/Whisper don't take video anyway). Needs Gemini billing active. Add a
  `runGeminiFileApiTranscription` path in
  `apps/api/src/ai/transcription-service.ts` that the dispatcher uses when
  `mimeType.startsWith("video/")` and size > the inline cap.
- **ffmpeg audio extraction** — extract the audio track (424MB video →
  ~10–40MB audio) with ffmpeg, then route through the EXISTING audio chain
  (Gemini inline if small, else Sarvam batch). Keeps the full multi-provider
  fallback. Adds ffmpeg as a worker-container system dependency — update
  `apps/api/Dockerfile` (or the App Runner build) **and** document the
  local-dev install. Two-step: extract → transcribe.

**Recommendation:** Gemini File API if Gemini billing is reliably on (simpler,
no container change); ffmpeg if video transcription must survive a Gemini
outage. Key files: `transcription-service.ts`, `transcription-queue.ts` (may
need a longer job timeout for extraction), the transcribe route's size/type
gating.

**Acceptance:** a >20MB video produces a transcript end-to-end; the media row
shows progress → completed; cost logged to `ai_usage_logs`; existing audio/PDF
paths unchanged.

---

## 7c. Auto-trigger OCR / transcription on publish — TODO

**Current:** OCR (documents/images) and transcription (audio/video) are manual
— the creator clicks "Extract text" / "Transcribe" per media item on the
content Edit tab. Deliberate for cost control while the feature settled; for
steady state it's friction.

**Task:** on `creator_content` publish (the `togglePublish` mutation in
`apps/api/src/trpc/routers/creator-content.ts`, which already enqueues the
embedding job), also enqueue OCR for un-extracted document/image media items
and transcription for un-transcribed audio/video media items.

- Gate behind a new flag `creators.auto_extract_on_publish` (default **OFF**)
  so it can be turned off; respect the existing `ocr_enabled` flag for OCR.
- **Idempotency:** skip items that already have `extractedText` or are
  `processing`.
- **Cost:** a publish could fan out many provider calls — prefer auto-extract
  only when the creator opts in per-upload (like the existing `handwritten`
  flag) rather than blanket-on. Log every call to `ai_usage_logs`.

**Acceptance:** with the flag OFF, publish behaves exactly as today; with it
ON, publishing fans out extraction for un-processed media only, idempotently;
no double-processing on re-publish.

---

## 7b. Sarvam batch — live validation (pending)

**Status:** the Sarvam batch path (`sarvam-saarika-batch`) is fully wired and
the `/v1` endpoint paths were fixed against Sarvam's docs, but it has **never
had a successful live run** — Gemini 2.5 Flash keeps succeeding first, so the
fallback is never reached. The batch flow (init → upload to Azure SAS →
`POST /job/v1/{id}/start` → poll `GET /job/v1/{id}/status` → fetch output) is
unverified against the live API beyond init+upload.

**Task:** force the batch path once (temporarily reorder
`TRANSCRIPTION_FALLBACK_ORDER` so batch is first, or point a >30s audio file at
it while Gemini quota is exhausted) and confirm: (a) `/start` returns 200 at the
`/v1` path, (b) status transitions Accepted → Running → Completed, (c)
`fetchTranscript` actually reads the output blob. If output fetch fails after a
Completed job, switch from the Azure-container-listing approach to Sarvam's
documented `POST /speech-to-text/job/v1/download-files` (body
`{ job_id, files }`). Watch the `[sarvam-batch]` diagnostic logs. Key file:
`apps/api/src/ai/transcription-batch-service.ts`.

---

## 7d. Gemini billing / quota (ops, not code)

A standing ops reminder, not a code task. Gemini's free tier sits at quota=0,
so the primary transcription/OCR/video paths intermittently fall through to
paid fallbacks (Claude, OpenAI, Sarvam) or fail when those are also exhausted.
Top up Gemini billing in Google AI Studio / GCP so `gemini-2.5-flash` and
`gemini-2.5-pro` are reliably available as the cheapest primary. No code
change; once billing is on, the existing fallback chains simply stop being
exercised as often.

---

## Also note

- **Promotions** — only the _admin review_ flow shipped. A creator-side
  "Create promotion" form, the public banner/featured display surface, and
  impression/click tracking + budget charging are still unbuilt (were
  explicitly out of scope for the admin slice).
- **Phase E (Growth)** from `docs/features/CREATORS_COMPLETE_SPEC.md` §9 is
  untouched: cross-platform PadVik↔ExamForge identity, institute white-label,
  institute API access, creator referral program, advanced recommendations.
- **PadVik port** — the additive port spec + prompts live in
  `docs/padvik-port/`; PadVik repo is at
  `E:\DEVELOPMENT\WEBSITE\ENSATE\INHOUSE\PadVik\PadVikProject`.
