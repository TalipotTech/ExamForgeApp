import { Queue } from "bullmq";
import type { SyllabusJobData } from "@examforge/shared/validators";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const SYLLABUS_QUEUE_NAME = "syllabus-processor";

type SyllabusQueue = Queue<SyllabusJobData>;

let syllabusQueue: SyllabusQueue | null = null;

function createQueue(): SyllabusQueue {
  return new Queue(SYLLABUS_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  }) as SyllabusQueue;
}

export function getSyllabusQueue(): SyllabusQueue {
  if (!syllabusQueue) {
    syllabusQueue = createQueue();
  }
  return syllabusQueue;
}

export async function addSyllabusJob(
  data: SyllabusJobData,
  opts?: { priority?: number; delay?: number },
): Promise<string> {
  const queue = getSyllabusQueue();
  const job = await queue.add(`process-syllabus:${data.syllabusId}`, data, {
    priority: opts?.priority,
    delay: opts?.delay,
  });
  return job.id!;
}

export async function closeSyllabusQueue(): Promise<void> {
  if (syllabusQueue) {
    await syllabusQueue.close();
    syllabusQueue = null;
  }
}
