import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const CONTENT_FETCH_QUEUE_NAME = "content-fetch";

export type ContentFetchJobData =
  | { type: "preview"; resultId: string }
  | { type: "extract_questions"; resultId: string; provider: string; userId: string }
  | { type: "extract_syllabus"; resultId: string; provider: string; userId: string }
  | { type: "download_pdf"; resultId: string; userId: string }
  | { type: "extract_text"; resultId: string; userId: string };

type ContentFetchQueue = Queue<ContentFetchJobData>;

let contentFetchQueue: ContentFetchQueue | null = null;

function createQueue(): ContentFetchQueue {
  return new Queue(CONTENT_FETCH_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  }) as ContentFetchQueue;
}

export function getContentFetchQueue(): ContentFetchQueue {
  if (!contentFetchQueue) {
    contentFetchQueue = createQueue();
  }
  return contentFetchQueue;
}

export async function addContentFetchJob(
  data: ContentFetchJobData,
  opts?: { priority?: number },
): Promise<string> {
  const queue = getContentFetchQueue();
  const job = await queue.add(`${data.type}:${data.resultId}`, data, {
    priority: opts?.priority,
  });
  return job.id!;
}

export async function closeContentFetchQueue(): Promise<void> {
  if (contentFetchQueue) {
    await contentFetchQueue.close();
    contentFetchQueue = null;
  }
}
