/**
 * Topic-Seeded Generation Queue
 *
 * Backs the generator described in §4.3 of
 * docs/features/QUESTION_ACQUISITION_STRATEGY.md. Each job generates
 * N new questions for one syllabus node, using real questions on
 * that node as style/difficulty seeds. Output is written with
 * sourceType='topic_ai' and each new question is auto-queued for
 * verification.
 */

import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const TOPIC_GENERATION_QUEUE_NAME = "topic-generation";

export type TopicGenerationJobData = {
  examId: string;
  /** bigint id — matches questions.mappedSyllabusNodeId FK. */
  syllabusNodeId: number;
  count: number;
  skipCoveredAspects: boolean;
  textbookReferences?: string[];
  userId: string;
  orgId: string;
};

type TopicGenerationQueue = Queue<TopicGenerationJobData>;

let topicGenerationQueue: TopicGenerationQueue | null = null;

function createQueue(): TopicGenerationQueue {
  return new Queue(TOPIC_GENERATION_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 15_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  }) as TopicGenerationQueue;
}

export function getTopicGenerationQueue(): TopicGenerationQueue {
  if (!topicGenerationQueue) topicGenerationQueue = createQueue();
  return topicGenerationQueue;
}

export async function addTopicGenerationJob(data: TopicGenerationJobData): Promise<string> {
  const queue = getTopicGenerationQueue();
  const job = await queue.add(
    `topic-gen:${data.examId}:${data.syllabusNodeId}:${Date.now()}`,
    data,
  );
  return job.id!;
}

export async function closeTopicGenerationQueue(): Promise<void> {
  if (topicGenerationQueue) {
    await topicGenerationQueue.close();
    topicGenerationQueue = null;
  }
}
