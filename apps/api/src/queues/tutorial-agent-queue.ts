import { Queue } from "bullmq";
import type { TutorialAgentJobData } from "@examforge/shared/validators";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const TUTORIAL_AGENT_QUEUE_NAME = "tutorial-agent";

type TutorialAgentQueue = Queue<TutorialAgentJobData>;

let tutorialAgentQueue: TutorialAgentQueue | null = null;

function createQueue(): TutorialAgentQueue {
  return new Queue(TUTORIAL_AGENT_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 50 },
    },
  }) as TutorialAgentQueue;
}

export function getTutorialAgentQueue(): TutorialAgentQueue {
  if (!tutorialAgentQueue) {
    tutorialAgentQueue = createQueue();
  }
  return tutorialAgentQueue;
}

export async function addTutorialAgentJob(
  data: TutorialAgentJobData,
  opts?: { priority?: number; delay?: number },
): Promise<string> {
  const queue = getTutorialAgentQueue();
  const job = await queue.add(`generate-tutorials:${data.syllabusId}`, data, {
    priority: opts?.priority,
    delay: opts?.delay,
  });
  return job.id!;
}

export async function closeTutorialAgentQueue(): Promise<void> {
  if (tutorialAgentQueue) {
    await tutorialAgentQueue.close();
    tutorialAgentQueue = null;
  }
}
