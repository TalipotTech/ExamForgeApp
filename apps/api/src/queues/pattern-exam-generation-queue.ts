/**
 * Pattern Exam Generation Queue
 *
 * Backs the "Generate & Start Pattern Exam" button on /exams/start.
 *
 * The AI call for a 100-question pattern exam routinely takes
 * 30-90 seconds. Running it inline in the tRPC mutation would block
 * the HTTP request past the Next.js dev proxy's socket timeout
 * (ECONNRESET), and in production push the load-balancer idle limit.
 * Queuing lets the mutation return immediately with `{ jobId }`, and
 * the UI polls `examPattern.getGeneratePatternExamStatus` every
 * few seconds until the worker writes the result.
 */

import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const PATTERN_EXAM_GENERATION_QUEUE_NAME = "pattern-exam-generation";

export type PatternExamGenerationJobData = {
  examId: string;
  userId: string;
  orgId: string;
  questionCount: number;
  includeRepeats: boolean;
  includeCurrentAffairs: boolean;
  yearFocus?: number | undefined;
};

/**
 * Stored on the completed job's `returnvalue` so the status-poll
 * endpoint can hand the UI the generated exam id + metadata.
 */
export type PatternExamGenerationJobResult = {
  /** bigserial id from user_generated_exams table. */
  userExamId: number;
  questionCount: number;
  patternVersion: number | null;
  papersAnalyzed: number;
};

type PatternExamGenerationQueue = Queue<PatternExamGenerationJobData>;

let patternExamGenerationQueue: PatternExamGenerationQueue | null = null;

function createQueue(): PatternExamGenerationQueue {
  return new Queue(PATTERN_EXAM_GENERATION_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 15_000 },
      // Keep a short history so getJob() can resolve for the UI
      // right after completion (status-poll endpoint needs to see
      // `completed` at least once before the UI cleans state).
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  }) as PatternExamGenerationQueue;
}

export function getPatternExamGenerationQueue(): PatternExamGenerationQueue {
  if (!patternExamGenerationQueue) patternExamGenerationQueue = createQueue();
  return patternExamGenerationQueue;
}

/**
 * Deterministic id per (exam, user, count). Clicking Generate twice
 * in quick succession on the same exam dedups to the same job while
 * it's active/waiting — prevents accidental double-spend on AI calls.
 * After completion, a timestamp suffix is appended so a legit re-run
 * is still allowed.
 */
export function buildPatternExamGenerationJobId(
  examId: string,
  userId: string,
  questionCount: number,
): string {
  return `pattern-exam-${examId}-${userId}-${questionCount}`;
}

export async function addPatternExamGenerationJob(
  data: PatternExamGenerationJobData,
): Promise<string> {
  const queue = getPatternExamGenerationQueue();
  const baseId = buildPatternExamGenerationJobId(data.examId, data.userId, data.questionCount);
  try {
    const existing = await queue.getJob(baseId);
    if (existing) {
      const state = await existing.getState();
      if (state === "completed" || state === "failed") {
        const retryId = `${baseId}-${Date.now()}`;
        const job = await queue.add(retryId, data, { jobId: retryId });
        return job.id!;
      }
      return existing.id!;
    }
  } catch {
    // Fall through.
  }
  const job = await queue.add(baseId, data, { jobId: baseId });
  return job.id!;
}

export async function getPatternExamGenerationJobStatus(jobId: string): Promise<{
  state: "waiting" | "active" | "completed" | "failed" | "delayed" | "unknown";
  progress: unknown;
  result: PatternExamGenerationJobResult | null;
  failedReason: string | null;
  createdAt: number | null;
  finishedAt: number | null;
} | null> {
  const queue = getPatternExamGenerationQueue();
  const job = await queue.getJob(jobId);
  if (!job) return null;
  const state = await job.getState();
  return {
    state: state as "waiting" | "active" | "completed" | "failed" | "delayed" | "unknown",
    progress: job.progress ?? null,
    result: (job.returnvalue as PatternExamGenerationJobResult | null) ?? null,
    failedReason: job.failedReason ?? null,
    createdAt: job.timestamp ?? null,
    finishedAt: job.finishedOn ?? null,
  };
}

export async function closePatternExamGenerationQueue(): Promise<void> {
  if (patternExamGenerationQueue) {
    await patternExamGenerationQueue.close();
    patternExamGenerationQueue = null;
  }
}
