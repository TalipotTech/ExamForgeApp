import { z } from "zod";
import { eq, and, desc, asc, ilike, or, gt, count } from "drizzle-orm";
import { exams, examNotifications, questions, discoveryRuns } from "@examforge/shared/db/schema";
import {
  examListingFilterSchema,
  updateExamAdminSchema,
  runDiscoveryInputSchema,
} from "@examforge/shared/validators";
import { router, publicProcedure, adminProcedure } from "../trpc.js";
import { runExamDiscovery } from "../../workers/discovery-agent.js";

export const examRouter = router({
  /** Public: paginated, filterable exam listing */
  listPublic: publicProcedure.input(examListingFilterSchema).query(async ({ ctx, input }) => {
    const { category, status, level, search, sort, page, limit } = input;
    const offset = (page - 1) * limit;

    const conditions = [eq(exams.isActive, true)];

    if (category) {
      conditions.push(eq(exams.category, category));
    }
    if (status) {
      conditions.push(eq(exams.status, status));
    }
    if (level) {
      conditions.push(eq(exams.level, level));
    }
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(exams.name, pattern),
          ilike(exams.conductingBody, pattern),
          ilike(exams.eligibility, pattern),
        )!,
      );
    }

    const whereClause = and(...conditions);

    let orderBy;
    switch (sort) {
      case "popularity":
        orderBy = desc(exams.popularityScore);
        break;
      case "questions":
        orderBy = desc(exams.questionCount);
        break;
      case "name":
        orderBy = asc(exams.name);
        break;
      case "date":
      default:
        orderBy = asc(exams.examDate);
        break;
    }

    const [examRows, totalResult] = await Promise.all([
      ctx.db.select().from(exams).where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
      ctx.db.select({ count: count() }).from(exams).where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      exams: examRows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }),

  /** Public: featured exams (curated by admin) */
  getFeatured: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(12).default(6) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 6;
      return ctx.db
        .select()
        .from(exams)
        .where(and(eq(exams.isFeatured, true), eq(exams.isActive, true)))
        .orderBy(asc(exams.examDate))
        .limit(limit);
    }),

  /** Public: upcoming exams by nearest date */
  getUpcoming: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(12).default(6) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 6;
      return ctx.db
        .select()
        .from(exams)
        .where(and(gt(exams.examDate, new Date()), eq(exams.isActive, true)))
        .orderBy(asc(exams.examDate))
        .limit(limit);
    }),

  /** Public: single exam by ID with notification count and question count */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [exam] = await ctx.db.select().from(exams).where(eq(exams.id, input.id)).limit(1);

      if (!exam) return null;

      const [notifCount] = await ctx.db
        .select({ count: count() })
        .from(examNotifications)
        .where(eq(examNotifications.examId, input.id));

      const [questionCount] = await ctx.db
        .select({ count: count() })
        .from(questions)
        .where(eq(questions.examId, input.id));

      // Get subject-wise question counts
      const subjectCounts = await ctx.db
        .select({
          subject: questions.subject,
          count: count(),
        })
        .from(questions)
        .where(eq(questions.examId, input.id))
        .groupBy(questions.subject);

      return {
        ...exam,
        notificationCount: notifCount?.count ?? 0,
        questionCount: questionCount?.count ?? 0,
        subjectCounts,
      };
    }),

  /** Protected: notifications for an exam */
  getNotifications: publicProcedure
    .input(z.object({ examId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(examNotifications)
        .where(eq(examNotifications.examId, input.examId))
        .orderBy(desc(examNotifications.detectedAt))
        .limit(20);
    }),

  /** Admin: update exam record */
  update: adminProcedure.input(updateExamAdminSchema).mutation(async ({ ctx, input }) => {
    const { id, ...updates } = input;

    const updateData: Record<string, unknown> = { ...updates, updatedAt: new Date() };

    // Convert date strings to Date objects
    for (const field of [
      "examDate",
      "registrationStart",
      "registrationEnd",
      "resultDate",
    ] as const) {
      if (field in updates && updates[field] !== undefined) {
        updateData[field] = updates[field] ? new Date(updates[field] as string) : null;
      }
    }

    await ctx.db.update(exams).set(updateData).where(eq(exams.id, id));

    return { success: true };
  }),

  /** Admin: toggle featured status */
  toggleFeatured: adminProcedure
    .input(z.object({ id: z.string().uuid(), featured: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(exams)
        .set({ isFeatured: input.featured, updatedAt: new Date() })
        .where(eq(exams.id, input.id));

      return { success: true };
    }),

  /** Admin: run the exam discovery agent with options */
  runDiscovery: adminProcedure
    .input(runDiscoveryInputSchema.optional())
    .mutation(async ({ ctx, input }) => {
      const result = await runExamDiscovery(ctx.db, ctx.userId, ctx.orgId ?? "", {
        portals: input?.portals,
        aiProvider: input?.aiProvider,
        maxPagesPerPortal: input?.maxPagesPerPortal,
        crawlerType: input?.crawlerType,
      });
      return result;
    }),

  /** Admin: get discovery run history */
  getDiscoveryRuns: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 10;
      return ctx.db
        .select()
        .from(discoveryRuns)
        .orderBy(desc(discoveryRuns.startedAt))
        .limit(limit);
    }),

  /** Admin: get a single discovery run by ID */
  getDiscoveryRunById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(discoveryRuns)
        .where(eq(discoveryRuns.id, input.id))
        .limit(1);
      return run ?? null;
    }),

  /** Admin: get discovered exams (auto-discovered) with search & filters */
  getDiscoveredExams: adminProcedure
    .input(
      z
        .object({
          search: z.string().max(200).optional(),
          status: z.enum(["upcoming", "active", "past", "draft"]).optional(),
          portal: z.string().max(255).optional(),
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(50).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;
      const offset = (page - 1) * limit;

      const conditions = [eq(exams.isAutoDiscovered, true)];
      if (input?.status) conditions.push(eq(exams.status, input.status));
      if (input?.portal) conditions.push(eq(exams.discoverySource, input.portal));
      if (input?.search) {
        conditions.push(
          or(
            ilike(exams.name, `%${input.search}%`),
            ilike(exams.conductingBody, `%${input.search}%`),
          )!,
        );
      }

      const whereClause = and(...conditions);

      const [examRows, totalResult] = await Promise.all([
        ctx.db
          .select()
          .from(exams)
          .where(whereClause)
          .orderBy(desc(exams.updatedAt))
          .limit(limit)
          .offset(offset),
        ctx.db.select({ count: count() }).from(exams).where(whereClause),
      ]);

      return {
        exams: examRows,
        total: totalResult[0]?.count ?? 0,
        page,
        totalPages: Math.ceil((totalResult[0]?.count ?? 0) / limit),
      };
    }),

  /** Admin: get all notifications with filters */
  getAllNotifications: adminProcedure
    .input(
      z
        .object({
          search: z.string().max(200).optional(),
          type: z.string().max(30).optional(),
          limit: z.number().int().min(1).max(100).default(50),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const conditions = [];
      if (input?.type) conditions.push(eq(examNotifications.type, input.type));
      if (input?.search) conditions.push(ilike(examNotifications.title, `%${input.search}%`));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      return ctx.db
        .select({
          id: examNotifications.id,
          examId: examNotifications.examId,
          type: examNotifications.type,
          title: examNotifications.title,
          description: examNotifications.description,
          sourceUrl: examNotifications.sourceUrl,
          isRead: examNotifications.isRead,
          isImportant: examNotifications.isImportant,
          detectedAt: examNotifications.detectedAt,
          createdAt: examNotifications.createdAt,
          examName: exams.name,
        })
        .from(examNotifications)
        .leftJoin(exams, eq(examNotifications.examId, exams.id))
        .where(whereClause)
        .orderBy(desc(examNotifications.detectedAt))
        .limit(limit);
    }),

  /** Admin: approve a discovered exam (draft → upcoming/active) */
  approveExam: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["upcoming", "active"]).default("upcoming"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(exams)
        .set({ status: input.status, isActive: true, updatedAt: new Date() })
        .where(eq(exams.id, input.id));
      return { success: true };
    }),
});
