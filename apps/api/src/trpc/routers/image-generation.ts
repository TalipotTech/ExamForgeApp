import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { imageGenerations, syllabi, syllabusNodes, exams } from "@examforge/shared/db/schema";
import { router, protectedProcedure, adminProcedure } from "../trpc.js";
import { generateImage } from "../../ai/image-router.js";
import { addImageSyncJob } from "../../queues/image-sync-queue.js";
import { syncTopicImage } from "../../services/topic-image-sync.js";

// [PLATFORM] ExamForge build — set to "examforge". PadVik build uses "padvik".
const PLATFORM = "examforge" as const;

const imagePurposeEnum = z.enum([
  "tutorial_diagram",
  "formula_card",
  "comparison_infographic",
  "pattern_chart",
  "topic_thumbnail",
  "exam_cover",
  "marketplace_cover",
  "creator_banner",
  "social_media",
  "chapter_illustration",
  "math_visualization",
  "science_diagram",
  "history_infographic",
  "chapter_thumbnail",
  "board_icon",
  "worksheet_header",
  "classroom_banner",
  "doubt_visualization",
  "placeholder",
  "custom",
]);

function startOfThisMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const imageGenerationRouter = router({
  // ─── Generate an image ───
  generate: protectedProcedure
    .input(
      z.object({
        purpose: imagePurposeEnum,
        prompt: z.string().min(5).max(1000),
        aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).default("1:1"),
        size: z.enum(["small", "standard", "hd"]).default("standard"),
        style: z
          .enum(["realistic", "illustration", "diagram", "flat", "watercolor"])
          .default("illustration"),
        contentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return generateImage(
        {
          ...input,
          platform: PLATFORM,
          userId: ctx.userId,
        },
        ctx.db,
      );
    }),

  // ─── Admin: monthly aggregate stats ───
  getStats: adminProcedure.query(async ({ ctx }) => {
    const monthStart = startOfThisMonth();
    const budget = parseFloat(process.env.IMAGE_MONTHLY_BUDGET_USD ?? "100");

    const [totals] = await ctx.db
      .select({
        count: sql<number>`COUNT(*)`,
        totalCost: sql<number>`COALESCE(SUM(${imageGenerations.costUsd}), 0)`,
        fallbackCount: sql<number>`COUNT(*) FILTER (WHERE ${imageGenerations.wasFallback} = true)`,
        avgTimeMs: sql<number>`COALESCE(AVG(${imageGenerations.generationTimeMs}), 0)`,
      })
      .from(imageGenerations)
      .where(gte(imageGenerations.createdAt, monthStart));

    const byModel = await ctx.db
      .select({
        model: imageGenerations.model,
        count: sql<number>`COUNT(*)`,
        cost: sql<number>`COALESCE(SUM(${imageGenerations.costUsd}), 0)`,
      })
      .from(imageGenerations)
      .where(gte(imageGenerations.createdAt, monthStart))
      .groupBy(imageGenerations.model)
      .orderBy(desc(sql`COUNT(*)`));

    const byPurpose = await ctx.db
      .select({
        purpose: imageGenerations.purpose,
        count: sql<number>`COUNT(*)`,
        cost: sql<number>`COALESCE(SUM(${imageGenerations.costUsd}), 0)`,
      })
      .from(imageGenerations)
      .where(gte(imageGenerations.createdAt, monthStart))
      .groupBy(imageGenerations.purpose)
      .orderBy(desc(sql`COUNT(*)`));

    const count = Number(totals?.count ?? 0);
    const fallbackCount = Number(totals?.fallbackCount ?? 0);

    return {
      budget,
      totalCount: count,
      totalCost: Number(totals?.totalCost ?? 0),
      fallbackRate: count > 0 ? fallbackCount / count : 0,
      avgGenerationTimeMs: Number(totals?.avgTimeMs ?? 0),
      byModel: byModel.map((m) => ({ ...m, count: Number(m.count), cost: Number(m.cost) })),
      byPurpose: byPurpose.map((p) => ({ ...p, count: Number(p.count), cost: Number(p.cost) })),
    };
  }),

  // ─── Admin: list syllabi (for the sync picker) ───
  listSyllabi: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: syllabi.id,
        name: syllabi.name,
        examId: syllabi.examId,
        examName: exams.name,
      })
      .from(syllabi)
      .leftJoin(exams, eq(syllabi.examId, exams.id))
      .orderBy(desc(syllabi.createdAt));

    const counts = await ctx.db
      .select({ syllabusId: syllabusNodes.syllabusId, count: sql<number>`COUNT(*)` })
      .from(syllabusNodes)
      .groupBy(syllabusNodes.syllabusId);
    const countMap = new Map(counts.map((c) => [Number(c.syllabusId), Number(c.count)]));

    return rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      examName: r.examName ?? "Unknown exam",
      topicCount: countMap.get(Number(r.id)) ?? 0,
    }));
  }),

  // ─── Admin: recent generated images (gallery) ───
  getRecent: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(60).default(24) }))
    .query(async ({ input, ctx }) => {
      return ctx.db
        .select({
          id: imageGenerations.id,
          purpose: imageGenerations.purpose,
          model: imageGenerations.model,
          prompt: imageGenerations.prompt,
          cdnUrl: imageGenerations.cdnUrl,
          width: imageGenerations.width,
          height: imageGenerations.height,
          costUsd: imageGenerations.costUsd,
          createdAt: imageGenerations.createdAt,
        })
        .from(imageGenerations)
        .orderBy(desc(imageGenerations.createdAt))
        .limit(input.limit);
    }),

  // ─── Admin: list topics in a syllabus (for the single-topic picker) ───
  listTopics: adminProcedure
    .input(z.object({ syllabusId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db
        .select({
          id: syllabusNodes.id,
          title: syllabusNodes.title,
          nodeType: syllabusNodes.nodeType,
          imageStatus: syllabusNodes.imageStatus,
          imageUrl: syllabusNodes.imageUrl,
        })
        .from(syllabusNodes)
        .where(eq(syllabusNodes.syllabusId, input.syllabusId))
        .orderBy(syllabusNodes.depth, syllabusNodes.sortOrder);

      // Same eligibility filter the worker uses.
      return rows
        .filter((r) => r.nodeType !== "unit" && r.nodeType !== "root")
        .map((r) => ({
          id: Number(r.id),
          title: r.title,
          imageStatus: r.imageStatus ?? "none",
          imageUrl: r.imageUrl,
        }));
    }),

  // ─── Admin: generate/sync a single topic's image (inline, no worker) ───
  syncTopic: adminProcedure
    .input(
      z.object({ syllabusNodeId: z.number().int().positive(), force: z.boolean().default(false) }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await syncTopicImage(
        { syllabusNodeId: input.syllabusNodeId, userId: ctx.userId, force: input.force },
        ctx.db,
      );
      return result;
    }),

  // ─── Admin: batch-sync context-derived images for a syllabus ───
  syncSyllabus: adminProcedure
    .input(z.object({ syllabusId: z.number().int().positive(), force: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      const [syllabus] = await ctx.db
        .select({ id: syllabi.id, examId: syllabi.examId })
        .from(syllabi)
        .where(eq(syllabi.id, input.syllabusId))
        .limit(1);
      if (!syllabus) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Syllabus not found" });
      }
      const jobId = await addImageSyncJob({
        syllabusId: syllabus.id,
        examId: syllabus.examId,
        userId: ctx.userId,
        force: input.force,
      });
      return { success: true as const, jobId };
    }),

  // ─── Admin: per-syllabus image sync status (counts by image_status) ───
  getSyncStatus: adminProcedure
    .input(z.object({ syllabusId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db
        .select({
          status: syllabusNodes.imageStatus,
          count: sql<number>`COUNT(*)`,
        })
        .from(syllabusNodes)
        .where(eq(syllabusNodes.syllabusId, input.syllabusId))
        .groupBy(syllabusNodes.imageStatus);

      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.status ?? "none"] = Number(r.count);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return {
        total,
        ready: counts.ready ?? 0,
        skipped: counts.skipped ?? 0,
        error: counts.error ?? 0,
        none: counts.none ?? 0,
      };
    }),

  // ─── User: generation history ───
  getHistory: protectedProcedure
    .input(
      z.object({
        contentId: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input, ctx }) => {
      const conditions = [eq(imageGenerations.userId, ctx.userId)];
      if (input.contentId) {
        conditions.push(eq(imageGenerations.contentId, input.contentId));
      }

      return ctx.db
        .select({
          id: imageGenerations.id,
          purpose: imageGenerations.purpose,
          model: imageGenerations.model,
          prompt: imageGenerations.prompt,
          cdnUrl: imageGenerations.cdnUrl,
          width: imageGenerations.width,
          height: imageGenerations.height,
          costUsd: imageGenerations.costUsd,
          createdAt: imageGenerations.createdAt,
        })
        .from(imageGenerations)
        .where(and(...conditions))
        .orderBy(desc(imageGenerations.createdAt))
        .limit(input.limit);
    }),
});
