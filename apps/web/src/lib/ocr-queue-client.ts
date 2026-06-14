/**
 * OCR enqueue helper for Next.js route handlers. Pushes jobs onto the
 * same BullMQ "ocr" queue that the worker in apps/api consumes. We let
 * BullMQ own the Redis connection (via the REDIS_URL env) so we don't
 * fight a dual ioredis install between the two apps.
 *
 * Queue name + job shape must mirror apps/api/src/queues/ocr-queue.ts
 * exactly — that's the producer/consumer contract.
 */

import { Queue } from "bullmq";

export type OcrModel = "claude-sonnet-4-6" | "gemini-2.5-pro" | "gemini-2.5-flash" | "gpt-4o";

export type OcrJobData = {
  contentId: string;
  mediaOrder: number;
  diskPath: string;
  mimeType: string;
  model: OcrModel;
  userId: string;
};

const OCR_QUEUE_NAME = "ocr";

function connectionOptions(): {
  host: string;
  port: number;
  password?: string;
  tls?: Record<string, never>;
} {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

let queue: Queue<OcrJobData> | null = null;

function getQueue(): Queue<OcrJobData> {
  if (queue) return queue;
  queue = new Queue<OcrJobData>(OCR_QUEUE_NAME, {
    connection: connectionOptions(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  });
  return queue;
}

export async function enqueueOcrJob(data: OcrJobData, opts?: { force?: boolean }): Promise<void> {
  // Default jobId dedupes initial uploads (if the upload route is retried,
  // the same id won't double-process). For explicit re-runs from the UI we
  // append a timestamp so BullMQ treats it as a new job — otherwise a
  // completed/failed job with the same ID silently skips the re-enqueue.
  //
  // BullMQ v5 rejects `:` in custom ids ("Custom Id cannot contain :"), so
  // we separate the segments with `-` instead.
  const jobId = opts?.force
    ? `ocr-${data.contentId}-${data.mediaOrder}-${Date.now()}`
    : `ocr-${data.contentId}-${data.mediaOrder}`;
  await getQueue().add("extract", data, { jobId });
}
