/**
 * Topic-Seeded Generation — admin tRPC router
 *
 * Backs the /admin/generation page. Admins pick a syllabus node,
 * the UI shows how many real seeds exist, and the `generate`
 * mutation queues a topic-generation job. The worker then does the
 * LLM call, writes new questions, and auto-queues verification.
 */

import { z } from "zod";
import { eq, and, or, sql, inArray } from "drizzle-orm";
import { exams, questions, syllabi, syllabusNodes } from "@examforge/shared/db/schema";
import { topicSeededGenerationInputSchema } from "@examforge/shared/validators";
import { router, adminProcedure } from "../trpc.js";
import {
  addTopicGenerationJob,
  getTopicGenerationJobStatus,
  getTopicGenerationQueue,
} from "../../queues/topic-generation-queue.js";

export const topicGenerationRouter = router({
  /**
   * Admin: list all syllabus nodes for an exam alongside counts of
   * real seeds (papers + textbook) and topic_ai questions already
   * generated. Drives the picker on the /admin/generation page.
   */
  listNodesForExam: adminProcedure.input(z.object({ examId: z.string().uuid() })).query(
    async ({
      ctx,
      input,
    }): Promise<{
      nodes: Array<{
        id: number;
        title: string;
        description: string | null;
        depth: number;
        parentTitle: string | null;
        seedCount: number;
        topicAiCount: number;
        totalCount: number;
        canGenerate: boolean;
      }>;
    }> => {
      // Load every syllabus node for every syllabus on this exam.
      const nodeRows = await ctx.db
        .select({
          id: syllabusNodes.id,
          title: syllabusNodes.title,
          description: syllabusNodes.description,
          depth: syllabusNodes.depth,
          parentId: syllabusNodes.parentId,
          syllabusId: syllabusNodes.syllabusId,
        })
        .from(syllabusNodes)
        .innerJoin(syllabi, eq(syllabusNodes.syllabusId, syllabi.id))
        .where(eq(syllabi.examId, input.examId));

      if (nodeRows.length === 0) {
        return { nodes: [] };
      }

      const nodeIds = nodeRows.map((n) => n.id);

      // Count questions per node, split by whether they are
      // seed-eligible (real_paper / textbook) vs topic_ai generated.
      // One query across all nodes rather than N round-trips.
      const countRows = await ctx.db
        .select({
          nodeId: sql<number>`COALESCE(${questions.mappedSyllabusNodeId}, ${questions.syllabusNodeId})`,
          sourceType: questions.sourceType,
          count: sql<number>`count(*)::int`,
        })
        .from(questions)
        .where(
          and(
            eq(questions.examId, input.examId),
            // Drizzle's `inArray` expands to `IN (...)` with proper
            // placeholders — `sql\`... = ANY(${arr})\`` would spread
            // the array as multiple params, which Postgres rejects.
            or(
              inArray(questions.mappedSyllabusNodeId, nodeIds),
              inArray(questions.syllabusNodeId, nodeIds),
            ),
          ),
        )
        .groupBy(
          sql`COALESCE(${questions.mappedSyllabusNodeId}, ${questions.syllabusNodeId})`,
          questions.sourceType,
        );

      // Build a lookup keyed by nodeId → { seedCount, topicAiCount }
      const counts = new Map<
        number,
        { seedCount: number; topicAiCount: number; totalCount: number }
      >();
      for (const row of countRows) {
        const nid = Number(row.nodeId);
        if (!counts.has(nid)) {
          counts.set(nid, { seedCount: 0, topicAiCount: 0, totalCount: 0 });
        }
        const bucket = counts.get(nid)!;
        const c = Number(row.count);
        bucket.totalCount += c;
        if (row.sourceType === "real_paper" || row.sourceType === "textbook") {
          bucket.seedCount += c;
        } else if (row.sourceType === "topic_ai") {
          bucket.topicAiCount += c;
        }
      }

      // Map parent id → title so we can render "Unit > Topic" labels.
      const nodeTitleById = new Map<number, string>();
      for (const n of nodeRows) nodeTitleById.set(Number(n.id), n.title);

      return {
        nodes: nodeRows
          .map((n) => {
            const c = counts.get(Number(n.id)) ?? {
              seedCount: 0,
              topicAiCount: 0,
              totalCount: 0,
            };
            const parentTitle =
              n.parentId !== null && n.parentId !== undefined
                ? nodeTitleById.get(Number(n.parentId))
                : undefined;
            return {
              id: Number(n.id),
              title: n.title,
              description: n.description,
              depth: n.depth,
              parentTitle: parentTitle ?? null,
              seedCount: c.seedCount,
              topicAiCount: c.topicAiCount,
              totalCount: c.totalCount,
              canGenerate: c.seedCount >= 3,
            };
          })
          .sort((a, b) => {
            // Deepest-first for leaf focus, stable by title otherwise.
            if (b.depth !== a.depth) return b.depth - a.depth;
            return a.title.localeCompare(b.title);
          }),
      };
    },
  ),

  /**
   * Admin: queue a topic-generation job. Worker picks it up, calls
   * the AI, writes questions, and auto-queues verification.
   */
  generate: adminProcedure
    .input(topicSeededGenerationInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Sanity check: exam must exist.
      const [exam] = await ctx.db
        .select({ id: exams.id })
        .from(exams)
        .where(eq(exams.id, input.examId))
        .limit(1);
      if (!exam) throw new Error("Exam not found");

      const jobId = await addTopicGenerationJob({
        examId: input.examId,
        syllabusNodeId: input.syllabusNodeId,
        count: input.count,
        skipCoveredAspects: input.skipCoveredAspects,
        textbookReferences: input.textbookReferences,
        userId: ctx.userId,
        orgId: ctx.orgId ?? "",
      });
      return { success: true, jobId };
    }),

  /**
   * Admin: status of the topic-generation job for one exam+node pair.
   * Returns null if no job has ever run. UI polls this after clicking
   * Generate to detect when the AI call finishes.
   */
  getJobStatus: adminProcedure
    .input(
      z.object({
        examId: z.string().uuid(),
        syllabusNodeId: z.number().int(),
      }),
    )
    .query(async ({ input }) => {
      return await getTopicGenerationJobStatus(input.examId, input.syllabusNodeId);
    }),

  /**
   * Admin: map of { nodeId → { state, progress } } for every
   * waiting / active / delayed generation job on this exam. Drives
   * the per-row "Generating…" / "Queued" badges on the topic table.
   * Scoped to in-flight states so completed jobs don't leave stale
   * badges on the UI.
   */
  getActiveJobsForExam: adminProcedure.input(z.object({ examId: z.string().uuid() })).query(
    async ({
      input,
    }): Promise<
      Record<
        number,
        {
          state: "waiting" | "active" | "delayed";
          progress: unknown;
          createdAt: number | null;
          jobId: string;
        }
      >
    > => {
      const queue = getTopicGenerationQueue();
      // Only the in-flight states — completed/failed jobs are
      // handled by re-fetching listNodesForExam (topicAiCount goes up).
      const jobs = await queue.getJobs(["waiting", "active", "delayed"], 0, 100);
      const result: Record<
        number,
        {
          state: "waiting" | "active" | "delayed";
          progress: unknown;
          createdAt: number | null;
          jobId: string;
        }
      > = {};
      for (const job of jobs) {
        const data = job.data as { examId?: string; syllabusNodeId?: number } | undefined;
        if (!data || data.examId !== input.examId || typeof data.syllabusNodeId !== "number") {
          continue;
        }
        const state = await job.getState();
        if (state !== "waiting" && state !== "active" && state !== "delayed") continue;
        result[data.syllabusNodeId] = {
          state,
          progress: job.progress ?? null,
          createdAt: job.timestamp ?? null,
          jobId: job.id ?? "",
        };
      }
      return result;
    },
  ),
});
