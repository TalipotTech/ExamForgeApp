/**
 * Transcription enqueue helper for Next.js route handlers. Mirrors the
 * shape of ocr-queue-client.ts — same BullMQ-as-producer pattern, same
 * dual-app split so we don't fight a duplicated ioredis install between
 * apps/web and apps/api.
 *
 * Queue name + job shape MUST mirror apps/api/src/queues/transcription-
 * queue.ts exactly — that's the producer/consumer contract.
 */

import { Queue } from "bullmq";

export type TranscriptionModel = "gemini-2.0-flash";

export type TranscriptionJobData = {
  contentId: string;
  mediaOrder: number;
  diskPath: string;
  mimeType: string;
  model: TranscriptionModel;
  userId: string;
};

const TRANSCRIPTION_QUEUE_NAME = "transcription";

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

let queue: Queue<TranscriptionJobData> | null = null;

function getQueue(): Queue<TranscriptionJobData> {
  if (queue) return queue;
  queue = new Queue<TranscriptionJobData>(TRANSCRIPTION_QUEUE_NAME, {
    connection: connectionOptions(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  });
  return queue;
}

export async function enqueueTranscriptionJob(
  data: TranscriptionJobData,
  opts?: { force?: boolean },
): Promise<void> {
  // Same dedup-vs-force convention as OCR. BullMQ v5 disallows `:` in
  // custom IDs, so segments are joined with `-`.
  const jobId = opts?.force
    ? `transcribe-${data.contentId}-${data.mediaOrder}-${Date.now()}`
    : `transcribe-${data.contentId}-${data.mediaOrder}`;
  await getQueue().add("transcribe-media", data, { jobId });
}
