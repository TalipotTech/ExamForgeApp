/**
 * Demand-Driven Auto-Content Scheduler
 *
 * Closes the loop from STEP 3's search ranking: on a daily cron it reads the
 * top demand nodes that still lack content and enqueues the EXISTING
 * generators so high-demand topics get filled in.
 *
 * - Missing questions → `topic-generation` job (clean per-node API; the worker
 *   itself no-ops if a node lacks ≥3 real seeds, so this is safe to fire).
 * - Missing tutorials → tutorial generation is whole-syllabus + needs a
 *   generation-job record, so we don't auto-fire it here; we log the gap for
 *   admin follow-up (the admin tutorial-agent flow covers it).
 *
 * Gated by AUTO_CONTENT_ENABLED. Non-fatal — logs a summary, never throws up.
 */

import { Worker, Job } from "bullmq";
import { eq, inArray } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import { users } from "@examforge/shared/db/schema";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import { AUTO_CONTENT_QUEUE_NAME, type AutoContentJobData } from "../queues/auto-content-queue.js";
import { getTopDemandNodes } from "../lib/auto-content/demand-tracker.js";
import { addTopicGenerationJob } from "../queues/topic-generation-queue.js";

const AUTO_CONTENT_ENABLED = process.env.AUTO_CONTENT_ENABLED !== "false";
const DAILY_NODE_LIMIT = Number(process.env.AUTO_CONTENT_DAILY_LIMIT ?? 10);
const MIN_DEMAND_SCORE = Number(process.env.AUTO_CONTENT_MIN_SCORE ?? 2);
const QUESTIONS_PER_NODE = Number(process.env.AUTO_CONTENT_QUESTIONS_PER_NODE ?? 10);

export function createAutoContentScheduler(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    AUTO_CONTENT_QUEUE_NAME,
    async (job: Job) => {
      const data = job.data as AutoContentJobData;
      if (!AUTO_CONTENT_ENABLED) {
        console.log("[auto-content] disabled (AUTO_CONTENT_ENABLED=false) — skipping");
        return { enqueued: 0, skipped: 0, reason: "disabled" };
      }

      // System actor — generation jobs need a userId/orgId for AI logging and
      // ownership. Use the first admin/superadmin (configurable override).
      const overrideUser = process.env.AUTO_CONTENT_SYSTEM_USER_ID;
      let actor: { id: string; orgId: string | null } | undefined;
      if (overrideUser) {
        const [u] = await db
          .select({ id: users.id, orgId: users.orgId })
          .from(users)
          .where(eq(users.id, overrideUser))
          .limit(1);
        actor = u;
      } else {
        const [u] = await db
          .select({ id: users.id, orgId: users.orgId })
          .from(users)
          .where(inArray(users.role, ["admin", "superadmin"]))
          .limit(1);
        actor = u;
      }

      if (!actor) {
        console.warn("[auto-content] no system actor (admin user) found — skipping run");
        return { enqueued: 0, skipped: 0, reason: "no-actor" };
      }

      const top = await getTopDemandNodes(db, {
        limit: DAILY_NODE_LIMIT,
        minScore: MIN_DEMAND_SCORE,
      });

      let enqueued = 0;
      let tutorialGaps = 0;
      let skipped = 0;

      for (const node of top) {
        if (!node.hasQuestions) {
          if (!node.examId) {
            skipped += 1;
            continue;
          }
          try {
            await addTopicGenerationJob({
              examId: node.examId,
              syllabusNodeId: node.syllabusNodeId,
              count: QUESTIONS_PER_NODE,
              skipCoveredAspects: true,
              userId: actor.id,
              orgId: actor.orgId ?? "",
            });
            enqueued += 1;
          } catch (err) {
            skipped += 1;
            console.warn(
              `[auto-content] failed to enqueue topic-generation for node ${node.syllabusNodeId}:`,
              err,
            );
          }
        }
        if (!node.hasTutorial) tutorialGaps += 1;
      }

      console.log(
        `[auto-content] trigger=${data.trigger} candidates=${top.length} questionJobs=${enqueued} tutorialGaps=${tutorialGaps} skipped=${skipped}`,
      );
      return { enqueued, tutorialGaps, skipped, candidates: top.length };
    },
    {
      connection: getBullMQConnection(),
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[auto-content] job ${job?.id} failed:`, err);
  });

  return worker;
}
