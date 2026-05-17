import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import { creatorContent } from "@examforge/shared/db/schema";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import {
  TRANSCRIPTION_QUEUE_NAME,
  type TranscriptionJobData,
} from "../queues/transcription-queue.js";
import { runTranscriptionWithFallback, TranscriptionFailure } from "../ai/transcription-service.js";
import { enqueueContentEmbedding } from "../queues/content-embedding-queue.js";

// Subset of MediaItem fields touched by transcription. Kept local so this
// file doesn't pull in the full validator zod schema.
type StoredMediaItem = {
  type: "video" | "audio" | "image" | "document";
  url: string;
  fileUploadId: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  order: number;
  extractedText?: string;
  transcriptionStatus?: "pending" | "processing" | "completed" | "failed";
  transcriptionModel?: string;
  transcriptionError?: string;
  // OCR fields exist on the same row but aren't touched here.
  ocrStatus?: "pending" | "processing" | "completed" | "failed";
  ocrModel?: string;
  ocrError?: string;
};

async function patchMediaItem(
  db: ReturnType<typeof createDatabase>,
  contentId: string,
  mediaOrder: number,
  patch: Partial<StoredMediaItem>,
): Promise<void> {
  const [row] = await db
    .select()
    .from(creatorContent)
    .where(eq(creatorContent.id, contentId))
    .limit(1);
  if (!row) return;
  const meta = (row.metadata as Record<string, unknown> | null) ?? {};
  const raw = (meta as { mediaItems?: StoredMediaItem[] }).mediaItems;
  const items: StoredMediaItem[] = Array.isArray(raw) ? (raw as StoredMediaItem[]) : [];
  const nextItems = items.map((m) => (m.order === mediaOrder ? { ...m, ...patch } : m));
  await db
    .update(creatorContent)
    .set({
      metadata: { ...meta, mediaItems: nextItems },
      updatedAt: new Date(),
    })
    .where(eq(creatorContent.id, contentId));
}

export function createTranscriptionWorker(): Worker<TranscriptionJobData> {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker<TranscriptionJobData>(
    TRANSCRIPTION_QUEUE_NAME,
    async (job) => {
      const { contentId, mediaOrder, diskPath, mimeType, model, language } = job.data;
      console.log(
        `[transcription] job ${job.id} — content=${contentId} order=${mediaOrder} model=${model}${language ? ` lang=${language}` : ""}`,
      );

      await patchMediaItem(db, contentId, mediaOrder, {
        transcriptionStatus: "processing",
        transcriptionError: undefined,
      });

      try {
        const result = await runTranscriptionWithFallback(diskPath, mimeType, model, language);
        await patchMediaItem(db, contentId, mediaOrder, {
          extractedText: result.markdown,
          transcriptionStatus: "completed",
          transcriptionModel: result.model,
          transcriptionError: undefined,
        });
        // Re-embed so the new transcript flows into the AI tutor without
        // a manual backfill. Fire-and-forget — embedding failure must
        // not bubble up and fail the transcription job itself.
        enqueueContentEmbedding(contentId, "retry").catch((err) => {
          console.warn(`[transcription] re-embed enqueue failed for ${contentId}:`, err);
        });
        return {
          model: result.model,
          durationMs: result.durationMs,
          chars: result.markdown.length,
        };
      } catch (err) {
        const message =
          err instanceof TranscriptionFailure
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        await patchMediaItem(db, contentId, mediaOrder, {
          transcriptionStatus: "failed",
          transcriptionError: message,
        });
        throw err;
      }
    },
    {
      connection: getBullMQConnection(),
      // Transcription is heavy + provider-rate-limited; serial is safer
      // than wide concurrency. Two slots so a slow job doesn't block the
      // whole queue.
      concurrency: 2,
    },
  );

  worker.on("completed", (job, result) => {
    console.log(`[transcription] completed ${job?.id}:`, result);
  });
  worker.on("failed", (job, err) => {
    console.error(`[transcription] failed ${job?.id}:`, err?.message);
  });

  return worker;
}
