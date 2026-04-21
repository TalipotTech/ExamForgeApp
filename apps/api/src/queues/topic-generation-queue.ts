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

/**
 * Build the deterministic jobId for one exam+node pair. BullMQ rejects
 * `:` in custom IDs (uses it internally as a Redis delimiter), so
 * hyphens separate the parts. Stable id means `getJob(id)` can be
 * used as a per-node "is there a generation in flight?" lookup.
 */
export function buildTopicGenerationJobId(examId: string, syllabusNodeId: number): string {
  return `topic-gen-${examId}-${syllabusNodeId}`;
}

export async function addTopicGenerationJob(data: TopicGenerationJobData): Promise<string> {
  const queue = getTopicGenerationQueue();
  const jobId = buildTopicGenerationJobId(data.examId, data.syllabusNodeId);
  // If an active/waiting job with this id exists, BullMQ returns the
  // existing one (same jobId dedup). If the previous run has already
  // completed/failed and been kept on the queue, passing the same id
  // would error — so we rotate the id with a timestamp suffix in that
  // case so a second generation round is allowed.
  try {
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "completed" || state === "failed") {
        const retryId = `${jobId}-${Date.now()}`;
        const job = await queue.add(retryId, data, { jobId: retryId });
        return job.id!;
      }
      // Active / waiting / delayed — return the existing job id.
      return existing.id!;
    }
  } catch {
    // Fall through and try a fresh add.
  }
  const job = await queue.add(jobId, data, { jobId });
  return job.id!;
}

/**
 * Look up the current status of a topic-generation job for a specific
 * exam+node pair. Returns null if no job has ever run for this pair
 * (or the queue has GC'd the record).
 */
export async function getTopicGenerationJobStatus(
  examId: string,
  syllabusNodeId: number,
): Promise<{
  state: "waiting" | "active" | "completed" | "failed" | "delayed" | "unknown";
  progress: unknown;
  createdAt: number | null;
  finishedAt: number | null;
  failedReason: string | null;
  jobId: string;
} | null> {
  const queue = getTopicGenerationQueue();
  const baseId = buildTopicGenerationJobId(examId, syllabusNodeId);

  // Also scan for retry-suffix variants so a re-run is still findable.
  const candidates = [baseId];
  // Try to find the most-recent retry by listing jobs with matching
  // prefix. BullMQ doesn't have a native prefix filter, but since
  // concurrency=1 and we clean old jobs, scanning recent states is cheap.
  const recent = await queue.getJobs(
    ["completed", "failed", "active", "waiting", "delayed"],
    0,
    50,
  );
  for (const j of recent) {
    if (j.id?.startsWith(`${baseId}-`) && !candidates.includes(j.id)) candidates.push(j.id);
  }

  let best: (Awaited<ReturnType<typeof queue.getJob>> & { _state?: string }) | undefined;
  let bestState: string | undefined;
  for (const id of candidates) {
    const job = await queue.getJob(id);
    if (!job) continue;
    const state = await job.getState();
    // Prefer an in-flight state over a completed one.
    const priority = { active: 0, waiting: 1, delayed: 2, failed: 3, completed: 4 };
    const p = (priority as Record<string, number>)[state] ?? 99;
    const bp = bestState ? ((priority as Record<string, number>)[bestState] ?? 99) : 100;
    if (!best || p < bp) {
      best = job;
      bestState = state;
    }
  }

  if (!best || !bestState) return null;

  return {
    state: bestState as "waiting" | "active" | "completed" | "failed" | "delayed" | "unknown",
    progress: best.progress ?? null,
    createdAt: best.timestamp ?? null,
    finishedAt: best.finishedOn ?? null,
    failedReason: best.failedReason ?? null,
    jobId: best.id!,
  };
}

export async function closeTopicGenerationQueue(): Promise<void> {
  if (topicGenerationQueue) {
    await topicGenerationQueue.close();
    topicGenerationQueue = null;
  }
}
