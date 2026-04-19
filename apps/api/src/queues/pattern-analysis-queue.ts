import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const PATTERN_ANALYSIS_QUEUE_NAME = "pattern-analysis";

export type PatternAnalysisJobType = "classify-paper" | "analyze-pattern";

export type PatternAnalysisJobData = {
  type: PatternAnalysisJobType;
  examId: string;
  portalDocumentId?: string;
  paperYear?: number;
  userId: string;
  orgId: string;
};

type PatternAnalysisQueue = Queue<PatternAnalysisJobData>;

let patternAnalysisQueue: PatternAnalysisQueue | null = null;

function createQueue(): PatternAnalysisQueue {
  return new Queue(PATTERN_ANALYSIS_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  }) as PatternAnalysisQueue;
}

export function getPatternAnalysisQueue(): PatternAnalysisQueue {
  if (!patternAnalysisQueue) {
    patternAnalysisQueue = createQueue();
  }
  return patternAnalysisQueue;
}

export async function addClassifyPaperJob(
  data: Omit<PatternAnalysisJobData, "type">,
): Promise<string> {
  const queue = getPatternAnalysisQueue();
  const jobName = data.portalDocumentId
    ? `classify:${data.portalDocumentId}`
    : `classify:${data.examId}:${data.paperYear ?? "all"}`;
  const job = await queue.add(jobName, { ...data, type: "classify-paper" });
  return job.id!;
}

export async function addAnalyzePatternJob(
  data: Omit<PatternAnalysisJobData, "type">,
): Promise<string> {
  const queue = getPatternAnalysisQueue();
  const job = await queue.add(`analyze:${data.examId}`, { ...data, type: "analyze-pattern" });
  return job.id!;
}

export async function closePatternAnalysisQueue(): Promise<void> {
  if (patternAnalysisQueue) {
    await patternAnalysisQueue.close();
    patternAnalysisQueue = null;
  }
}
