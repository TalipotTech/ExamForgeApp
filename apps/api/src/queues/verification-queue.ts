/**
 * Verification Queue — Question Acquisition Strategy
 *
 * BullMQ queue for the multi-layer verification worker. Each job
 * runs all 6 automated verification layers (source, factual,
 * syllabus, pattern, duplicate, composite) for ONE question and
 * decides its verificationStatus.
 *
 * Triggered from:
 *   - pattern-analysis-worker.classifyPaper (after classification
 *     enriches questions with analyzedSubject/Topic/Style)
 *   - topic-seeded-generator (Phase 5 — each generated question)
 *   - admin tRPC "verify now" endpoint (Phase 4)
 */

import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const VERIFICATION_QUEUE_NAME = "verification";

export type VerificationJobData = {
  questionId: string;
  userId: string;
  orgId: string;
  /** Marks the job as auto-triggered (for logging). Manual admin
   *  triggers set false. */
  autoTriggered?: boolean;
  /** Skip layers that were already run recently (within 24h).
   *  Used by admin "revalidate" action. */
  force?: boolean;
};

type VerificationQueue = Queue<VerificationJobData>;

let verificationQueue: VerificationQueue | null = null;

function createQueue(): VerificationQueue {
  return new Queue(VERIFICATION_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  }) as VerificationQueue;
}

export function getVerificationQueue(): VerificationQueue {
  if (!verificationQueue) verificationQueue = createQueue();
  return verificationQueue;
}

export async function addVerifyQuestionJob(data: VerificationJobData): Promise<string> {
  const queue = getVerificationQueue();
  // BullMQ rejects `:` in custom jobIds ("Custom Id cannot contain :")
  // because Redis uses `:` as its key delimiter internally. Use `-`
  // instead — the semantics (one-dedup-key per question) are the same.
  const dedupKey = `verify-${data.questionId}`;
  const job = await queue.add(dedupKey, data, {
    // Dedupe — if another job for the same question is already queued,
    // a later attempt will replace it.
    jobId: dedupKey,
  });
  return job.id!;
}

export async function closeVerificationQueue(): Promise<void> {
  if (verificationQueue) {
    await verificationQueue.close();
    verificationQueue = null;
  }
}
