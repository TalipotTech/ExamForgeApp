import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import type { TranscriptionModel } from "../ai/transcription-service.js";

export const TRANSCRIPTION_QUEUE_NAME = "transcription";

export type TranscriptionJobData = {
  contentId: string;
  /** Index inside creator_content.metadata.mediaItems. Same convention
   *  as the OCR queue uses for `mediaOrder`. */
  mediaOrder: number;
  diskPath: string;
  mimeType: string;
  model: TranscriptionModel;
  userId: string;
};

type TranscriptionQueue = Queue<TranscriptionJobData>;

let queueInstance: TranscriptionQueue | null = null;

function createQueue(): TranscriptionQueue {
  return new Queue(TRANSCRIPTION_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      // Transcription is expensive — don't auto-retry on hard failures
      // (provider rejection, file too large). The worker decides.
      attempts: 2,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  }) as TranscriptionQueue;
}

export function getTranscriptionQueue(): TranscriptionQueue {
  if (!queueInstance) {
    queueInstance = createQueue();
  }
  return queueInstance;
}

export async function enqueueTranscriptionJob(data: TranscriptionJobData): Promise<void> {
  const queue = getTranscriptionQueue();
  await queue.add("transcribe-media", data, {
    jobId: `transcribe:${data.contentId}:${data.mediaOrder}`,
  });
}

export async function closeTranscriptionQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}
