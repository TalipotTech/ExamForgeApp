import { Worker } from "bullmq";
import { createDatabase } from "@examforge/shared/db";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import {
  CONTENT_EMBEDDING_QUEUE_NAME,
  type ContentEmbeddingJobData,
} from "../queues/content-embedding-queue.js";
import { upsertContentEmbeddings } from "../services/content-embedding.js";

export function createContentEmbeddingWorker(): Worker<ContentEmbeddingJobData> {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker<ContentEmbeddingJobData>(
    CONTENT_EMBEDDING_QUEUE_NAME,
    async (job) => {
      const { contentId, trigger } = job.data;
      console.log(`[content-embedding] Embedding content ${contentId} (trigger=${trigger})`);
      const started = Date.now();
      const result = await upsertContentEmbeddings(db, contentId);
      const ms = Date.now() - started;
      const srcSummary = result.sources
        ? Object.entries(result.sources)
            .filter(([, v]) => (typeof v === "number" ? v > 0 : v === true))
            .map(([k, v]) => (typeof v === "number" ? `${k}=${v}` : k))
            .join(",") || "none"
        : "n/a";
      console.log(
        `[content-embedding] ${contentId} done in ${ms}ms — chunks=${result.chunks} skipped=${result.skipped} reason=${result.reason ?? "-"} sources=${srcSummary}`,
      );
      return result;
    },
    {
      connection: getBullMQConnection(),
      concurrency: 2,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[content-embedding] Job ${job?.id} completed:`, job?.returnvalue);
  });

  worker.on("failed", (job, err) => {
    console.error(`[content-embedding] Job ${job?.id} failed:`, err);
  });

  return worker;
}
