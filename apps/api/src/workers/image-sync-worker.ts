import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import type { Database } from "@examforge/shared/db";
import { syllabusNodes, syllabi, exams } from "@examforge/shared/db/schema";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import { IMAGE_SYNC_QUEUE_NAME } from "../queues/image-sync-queue.js";
import type { ImageSyncJobData } from "../queues/image-sync-queue.js";
import { syncTopicImage } from "../services/topic-image-sync.js";

// ─── Worker Factory ───

export function createImageSyncWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    IMAGE_SYNC_QUEUE_NAME,
    async (job: Job) => {
      const data = job.data as ImageSyncJobData;
      return processImageSyncJob(job, data, db);
    },
    {
      connection: getBullMQConnection(),
      concurrency: 1, // one syllabus at a time; providers are rate-limited
    },
  );

  worker.on("completed", (job) => {
    console.log(`[image-sync] Job ${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[image-sync] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// ─── Types ───

type ImageSyncResult = {
  total: number;
  generated: number;
  skipped: number;
  failed: number;
  stoppedOnBudget: boolean;
};

function isBudgetError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /budget/i.test(msg);
}

// ─── Main Job Processor ───
//
// Whole-syllabus batch: iterate eligible topics, delegating each to the
// shared syncTopicImage service (same logic as the single-topic mutation).
// Idempotent (unchanged topics skip), non-fatal per topic, pauses on budget.

async function processImageSyncJob(
  job: Job,
  data: ImageSyncJobData,
  db: Database,
): Promise<ImageSyncResult> {
  const { syllabusId, examId, userId, force } = data;

  const [exam] = await db
    .select({ name: exams.name })
    .from(exams)
    .where(eq(exams.id, examId))
    .limit(1);
  // Fall back to the syllabus's exam if examId wasn't supplied/found.
  let examName = exam?.name;
  if (!examName) {
    const [s] = await db
      .select({ examName: exams.name })
      .from(syllabi)
      .leftJoin(exams, eq(syllabi.examId, exams.id))
      .where(eq(syllabi.id, syllabusId))
      .limit(1);
    examName = s?.examName ?? "this exam";
  }

  const nodes = await db
    .select({
      id: syllabusNodes.id,
      title: syllabusNodes.title,
      nodeType: syllabusNodes.nodeType,
    })
    .from(syllabusNodes)
    .where(eq(syllabusNodes.syllabusId, syllabusId))
    .orderBy(syllabusNodes.depth, syllabusNodes.sortOrder);

  // Skip structural nodes (units/root); the brief step makes the final call
  // on whether each topic actually warrants a visual.
  const eligible = nodes.filter((n) => n.nodeType !== "unit" && n.nodeType !== "root");

  const result: ImageSyncResult = {
    total: eligible.length,
    generated: 0,
    skipped: 0,
    failed: 0,
    stoppedOnBudget: false,
  };

  for (let i = 0; i < eligible.length; i++) {
    const node = eligible[i]!;
    try {
      const r = await syncTopicImage({ syllabusNodeId: node.id, userId, force, examName }, db);
      if (r.status === "ready") result.generated++;
      else result.skipped++;
    } catch (e) {
      if (isBudgetError(e)) {
        console.warn(`[image-sync] Budget exhausted on "${node.title}" — stopping run.`);
        result.stoppedOnBudget = true;
        break;
      }
      console.error(
        `[image-sync] Failed for "${node.title}": ${e instanceof Error ? e.message : String(e)}`,
      );
      await db
        .update(syllabusNodes)
        .set({ imageStatus: "error", updatedAt: new Date() })
        .where(eq(syllabusNodes.id, node.id));
      result.failed++;
    }

    await job.updateProgress(Math.round(((i + 1) / eligible.length) * 100));
  }

  console.log(
    `[image-sync] syllabus ${syllabusId}: ${result.generated} generated, ${result.skipped} skipped, ${result.failed} failed${result.stoppedOnBudget ? " (stopped on budget)" : ""}`,
  );
  return result;
}
