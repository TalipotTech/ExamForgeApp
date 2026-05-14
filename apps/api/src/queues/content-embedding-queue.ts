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
  await queue.add(
    "embed-content",
    { contentId, trigger },
    { jobId: `embed:${contentId}` },
  );
}

export async function closeContentEmbeddingQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}
