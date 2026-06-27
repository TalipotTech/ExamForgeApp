import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const AUTO_CONTENT_QUEUE_NAME = "auto-content";

export type AutoContentJobData = {
  trigger: "scheduled" | "manual";
};

type AutoContentQueue = Queue<AutoContentJobData>;

let autoContentQueue: AutoContentQueue | null = null;

function createQueue(): AutoContentQueue {
  return new Queue(AUTO_CONTENT_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 50 },
    },
  }) as AutoContentQueue;
}

export function getAutoContentQueue(): AutoContentQueue {
  if (!autoContentQueue) autoContentQueue = createQueue();
  return autoContentQueue;
}

/** Daily demand-driven content sweep (04:00). */
export async function scheduleAutoContentJob(): Promise<void> {
  const queue = getAutoContentQueue();
  await queue.upsertJobScheduler(
    "auto-content-daily",
    { pattern: "0 4 * * *" },
    { name: "demand-sweep", data: { trigger: "scheduled" } },
  );
}

export async function closeAutoContentQueue(): Promise<void> {
  if (autoContentQueue) {
    await autoContentQueue.close();
    autoContentQueue = null;
  }
}
