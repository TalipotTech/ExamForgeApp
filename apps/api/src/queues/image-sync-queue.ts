import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const IMAGE_SYNC_QUEUE_NAME = "image-sync";

// Batch-generate context-derived images for every eligible topic in a
// syllabus. Idempotent: topics whose source content is unchanged are
// skipped (see image-sync-worker.ts).
export interface ImageSyncJobData {
  syllabusId: number;
  examId: string;
  userId: string;
  /** Regenerate even if the content hash is unchanged. */
  force?: boolean;
}

type ImageSyncQueue = Queue<ImageSyncJobData>;

let imageSyncQueue: ImageSyncQueue | null = null;

function createQueue(): ImageSyncQueue {
  return new Queue(IMAGE_SYNC_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 50 },
    },
  }) as ImageSyncQueue;
}

export function getImageSyncQueue(): ImageSyncQueue {
  if (!imageSyncQueue) {
    imageSyncQueue = createQueue();
  }
  return imageSyncQueue;
}

export async function addImageSyncJob(
  data: ImageSyncJobData,
  opts?: { priority?: number; delay?: number },
): Promise<string> {
  const queue = getImageSyncQueue();
  const job = await queue.add(`sync-images:${data.syllabusId}`, data, {
    priority: opts?.priority,
    delay: opts?.delay,
  });
  return job.id!;
}

export async function closeImageSyncQueue(): Promise<void> {
  if (imageSyncQueue) {
    await imageSyncQueue.close();
    imageSyncQueue = null;
  }
}
