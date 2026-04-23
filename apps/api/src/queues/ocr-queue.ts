import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import type { OcrModel } from "../ai/ocr-service.js";

export const OCR_QUEUE_NAME = "ocr";

export type OcrJobData = {
  contentId: string;
  mediaOrder: number;
  diskPath: string;
  mimeType: string;
  model: OcrModel;
  userId: string;
};

export type OcrQueue = Queue<OcrJobData>;

let queueInstance: OcrQueue | null = null;

function createQueue(): OcrQueue {
  return new Queue(OCR_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  }) as OcrQueue;
}

export function getOcrQueue(): OcrQueue {
  if (!queueInstance) queueInstance = createQueue();
  return queueInstance;
}

export async function enqueueOcrJob(data: OcrJobData): Promise<void> {
  const queue = getOcrQueue();
  await queue.add("extract", data, {
    // Unique per (content, mediaOrder) so repeated submits don't duplicate.
    jobId: `ocr:${data.contentId}:${data.mediaOrder}`,
  });
}

export async function closeOcrQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}
