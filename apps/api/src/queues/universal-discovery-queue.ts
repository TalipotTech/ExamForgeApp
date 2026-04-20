/**
 * Universal Discovery Queue — Universal Discovery Agent v2
 *
 * Async BullMQ queue for the universal discovery worker. Three job types:
 *  - broad-discover: sweep a portal's notifications/calendar pages, upsert exams
 *  - deep-discover: per-exam crawl across all portals that conduct it
 *                   (previous papers, answer keys, syllabus) to fill gaps
 *  - validate-exam: URL sanity, date sanity, compute contentCompleteness
 */

import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const UNIVERSAL_DISCOVERY_QUEUE_NAME = "universal-discovery";

export type UniversalDiscoveryJobType = "broad-discover" | "deep-discover" | "validate-exam";

export type BroadDiscoverJobData = {
  type: "broad-discover";
  portalId: string;
  maxPages: number;
  userId: string;
  orgId: string;
  discoveryRunId?: string;
};

export type DeepDiscoverJobData = {
  type: "deep-discover";
  examId: string;
  /** If true, skip portals already crawled for this exam in the last 24h. */
  skipRecent: boolean;
  userId: string;
  orgId: string;
};

export type ValidateExamJobData = {
  type: "validate-exam";
  examId: string;
};

export type UniversalDiscoveryJobData =
  | BroadDiscoverJobData
  | DeepDiscoverJobData
  | ValidateExamJobData;

type UniversalDiscoveryQueue = Queue<UniversalDiscoveryJobData>;

let universalDiscoveryQueue: UniversalDiscoveryQueue | null = null;

function createQueue(): UniversalDiscoveryQueue {
  return new Queue(UNIVERSAL_DISCOVERY_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 400 },
    },
  }) as UniversalDiscoveryQueue;
}

export function getUniversalDiscoveryQueue(): UniversalDiscoveryQueue {
  if (!universalDiscoveryQueue) {
    universalDiscoveryQueue = createQueue();
  }
  return universalDiscoveryQueue;
}

export async function addBroadDiscoverJob(
  data: Omit<BroadDiscoverJobData, "type">,
): Promise<string> {
  const queue = getUniversalDiscoveryQueue();
  const job = await queue.add(`broad:${data.portalId}`, {
    ...data,
    type: "broad-discover",
  });
  return job.id!;
}

export async function addDeepDiscoverJob(data: Omit<DeepDiscoverJobData, "type">): Promise<string> {
  const queue = getUniversalDiscoveryQueue();
  const job = await queue.add(`deep:${data.examId}`, {
    ...data,
    type: "deep-discover",
  });
  return job.id!;
}

export async function addValidateExamJob(data: Omit<ValidateExamJobData, "type">): Promise<string> {
  const queue = getUniversalDiscoveryQueue();
  const job = await queue.add(`validate:${data.examId}`, {
    ...data,
    type: "validate-exam",
  });
  return job.id!;
}

export async function closeUniversalDiscoveryQueue(): Promise<void> {
  if (universalDiscoveryQueue) {
    await universalDiscoveryQueue.close();
    universalDiscoveryQueue = null;
  }
}
