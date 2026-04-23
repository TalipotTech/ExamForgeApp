import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import { creatorContent } from "@examforge/shared/db/schema";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import { OCR_QUEUE_NAME, type OcrJobData } from "../queues/ocr-queue.js";
import { runOcrWithFallback } from "../ai/ocr-service.js";

type StoredMediaItem = {
  type: "video" | "audio" | "image" | "document";
  url: string;
  fileUploadId: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  order: number;
  extractedText?: string;
  ocrStatus?: "pending" | "processing" | "completed" | "failed";
  ocrModel?: string;
  ocrError?: string;
};

async function applyOcrResult(
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
  const items: StoredMediaItem[] = Array.isArray(
    (meta as { mediaItems?: StoredMediaItem[] }).mediaItems,
  )
    ? ((meta as { mediaItems?: StoredMediaItem[] }).mediaItems as StoredMediaItem[])
    : [];
  const nextItems = items.map((m) => (m.order === mediaOrder ? { ...m, ...patch } : m));
  await db
    .update(creatorContent)
    .set({
      metadata: { ...meta, mediaItems: nextItems },
      updatedAt: new Date(),
    })
    .where(eq(creatorContent.id, contentId));
}

export function createOcrWorker(): Worker<OcrJobData> {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker<OcrJobData>(
    OCR_QUEUE_NAME,
    async (job) => {
      const { contentId, mediaOrder, diskPath, mimeType, model } = job.data;
      console.log(`[ocr] job ${job.id} — content=${contentId} order=${mediaOrder} model=${model}`);

      await applyOcrResult(db, contentId, mediaOrder, {
        ocrStatus: "processing",
      });

      try {
        const result = await runOcrWithFallback(diskPath, mimeType, model);
        await applyOcrResult(db, contentId, mediaOrder, {
          extractedText: result.markdown,
          ocrStatus: "completed",
          ocrModel: result.model,
          ocrError: undefined,
        });
        return {
          model: result.model,
          durationMs: result.durationMs,
          chars: result.markdown.length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await applyOcrResult(db, contentId, mediaOrder, {
          ocrStatus: "failed",
          ocrError: message,
        });
        throw err;
      }
    },
    { connection: getBullMQConnection(), concurrency: 2 },
  );

  worker.on("completed", (job, result) => {
    console.log(`[ocr] completed ${job?.id}:`, result);
  });
  worker.on("failed", (job, err) => {
    console.error(`[ocr] failed ${job?.id}:`, err?.message);
  });

  return worker;
}
