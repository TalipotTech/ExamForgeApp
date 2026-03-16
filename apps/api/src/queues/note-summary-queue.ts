import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const NOTE_SUMMARY_QUEUE_NAME = "note-summary";

type NoteSummaryJobData = {
  trigger: "scheduled" | "manual";
};

type NoteSummaryQueue = Queue<NoteSummaryJobData>;

let noteSummaryQueue: NoteSummaryQueue | null = null;

function createQueue(): NoteSummaryQueue {
  return new Queue(NOTE_SUMMARY_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 50 },
    },
  }) as NoteSummaryQueue;
}

export function getNoteSummaryQueue(): NoteSummaryQueue {
  if (!noteSummaryQueue) {
    noteSummaryQueue = createQueue();
  }
  return noteSummaryQueue;
}

export async function scheduleNoteSummaryJob(): Promise<void> {
  const queue = getNoteSummaryQueue();
  // Run daily at 3am
  await queue.upsertJobScheduler(
    "note-summary-daily",
    { pattern: "0 3 * * *" },
    { name: "generate-summaries", data: { trigger: "scheduled" } },
  );
}

export async function closeNoteSummaryQueue(): Promise<void> {
  if (noteSummaryQueue) {
    await noteSummaryQueue.close();
    noteSummaryQueue = null;
  }
}
