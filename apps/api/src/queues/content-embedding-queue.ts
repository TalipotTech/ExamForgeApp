import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const CONTENT_EMBEDDING_QUEUE_NAME = "content-embedding";

export type ContentEmbeddingJobData = {
  contentId: string;
  trigger: "publish" | "manual" | "retry";
};

type ContentEmbeddingQueue = Queue<ContentEmbeddingJobData>;

let queueInstance: ContentEmbeddingQueue | null = null;

function createQueue(): ContentEmbeddingQueue {
  return new Queue(CONTENT_EMBEDDING_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  }) as ContentEmbeddingQueue;
}

export function getContentEmbeddingQueue(): ContentEmbeddingQueue {
  if (!queueInstance) {
    queueInstance = createQueue();
  }
  return queueInstance;
}

export async function enqueueContentEmbedding(
  contentId: string,
  trigger: ContentEmbeddingJobData["trigger"] = "publish",
): Promise<void> {
  const queue = getContentEmbeddingQueue();
  // BullMQ's add() with a fixed jobId is a no-op when a job with that ID
  // already exists in ANY state — including completed/failed history
  // retained by removeOnComplete/removeOnFail. That means a stable
  // `embed-${contentId}` would silently swallow every backfill after
  // the first run. Use a per-call jobId so each enqueue actually lands.
  // The contentId + trigger prefix keeps logs readable.
  const ts = Date.now();
  await queue.add(
    "embed-content",
    { contentId, trigger },
    { jobId: `embed-${contentId}-${trigger}-${ts}` },
  );
}

export async function closeContentEmbeddingQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}
