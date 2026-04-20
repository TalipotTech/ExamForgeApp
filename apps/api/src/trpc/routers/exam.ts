import { z } from "zod";
import { eq, and, desc, asc, ilike, or, gt, count, sql, notInArray, inArray } from "drizzle-orm";
import {
  exams,
  examNotifications,
  questions,
  discoveryRuns,
  userExams,
  syllabi,
  portalDocuments,
  subscriptionPlans,
  userSubscriptions,
} from "@examforge/shared/db/schema";
import {
  examListingFilterSchema,
  updateExamAdminSchema,
  runDiscoveryInputSchema,
  runUniversalDiscoveryInputSchema,
  runDeepDiscoveryInputSchema,
  runExamValidationInputSchema,
} from "@examforge/shared/validators";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc.js";
import { runExamDiscovery } from "../../workers/discovery-agent.js";
import {
  addBroadDiscoverJob,
  addDeepDiscoverJob,
  addValidateExamJob,
} from "../../queues/universal-discovery-queue.js";
import { OFFICIAL_PORTALS, getPortalsForFrequency } from "../../config/official-portals.js";

const FREE_TIER_MAX_EXAMS = 3;

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

  /**
   * Admin: Universal Discovery v2 — queue async broad-discover jobs across
   * the official portal registry. One BullMQ job per portal; worker uses
   * the universal AI parser so any portal format is handled.
   */
  runUniversalDiscovery: adminProcedure
    .input(runUniversalDiscoveryInputSchema.optional())
    .mutation(async ({ ctx, input }) => {
      const portalIds = input?.portalIds?.length
        ? input.portalIds
        : getPortalsForFrequency("daily").map((p) => p.id);
      const maxPages = input?.maxPagesPerPortal ?? 3;

      const jobIds: string[] = [];
      for (const portalId of portalIds) {
        const jobId = await addBroadDiscoverJob({
          portalId,
          maxPages,
          userId: ctx.userId,
          orgId: ctx.orgId ?? "",
        });
        jobIds.push(jobId);
      }
      return { success: true, portalsQueued: portalIds.length, jobIds };
    }),

  /**
   * Admin: Universal Discovery v2 — queue a deep-discover job for an exam.
   * The worker will crawl previousPapers / answerKeys / syllabus pages
   * across every portal that conducts this exam and create portal_documents
   * for each new PDF link found.
   */
  runDeepDiscovery: adminProcedure
    .input(runDeepDiscoveryInputSchema)
    .mutation(async ({ ctx, input }) => {
      const jobId = await addDeepDiscoverJob({
        examId: input.examId,
        skipRecent: input.skipRecent,
        userId: ctx.userId,
        orgId: ctx.orgId ?? "",
      });
      return { success: true, jobId };
    }),

  /**
   * Admin: Recompute contentCompleteness for an exam. Synchronous to the
   * client but runs as a queued job — the caller gets a job id back.
   */
  validateExam: adminProcedure.input(runExamValidationInputSchema).mutation(async ({ input }) => {
    const jobId = await addValidateExamJob({ examId: input.examId });
    return { success: true, jobId };
  }),

  /**
   * Admin: read the official portal registry. Used by the content
   * acquisition dashboard to render the portal status grid.
   */
  getOfficialPortals: adminProcedure.query(() => {
    return OFFICIAL_PORTALS.map((p) => ({
      id: p.id,
      name: p.name,
      domain: p.domain,
      type: p.type,
      checkFrequency: p.checkFrequency,
      priority: p.priority,
      examsConducted: p.examsConducted,
      fetchMethod: p.fetchMethod,
      notes: p.notes,
    }));
  }),

  /**
   * Admin: portal registry enriched with last-checked timestamps and
   * health status from recent discovery_runs. Powers the status grid
   * on the content acquisition dashboard.
   */
  getPortalStatus: adminProcedure.query(async ({ ctx }) => {
    // Pull recent runs to compute last-checked-per-portal.
    const recentRuns = await ctx.db
      .select({
        id: discoveryRuns.id,
        portalsChecked: discoveryRuns.portalsChecked,
        status: discoveryRuns.status,
        startedAt: discoveryRuns.startedAt,
        completedAt: discoveryRuns.completedAt,
        examsFound: discoveryRuns.examsFound,
        errorLog: discoveryRuns.errorLog,
      })
      .from(discoveryRuns)
      .orderBy(desc(discoveryRuns.startedAt))
      .limit(100);

    return OFFICIAL_PORTALS.map((p) => {
      // Portal is referenced by domain in the v1 runs and by id in v2.
      // Match either.
      const mostRecent = recentRuns.find((r) => {
        const list = (r.portalsChecked ?? []) as string[];
        return list.some((entry) => entry === p.id || entry.includes(p.domain));
      });

      const now = Date.now();
      const ageMs = mostRecent?.startedAt ? now - new Date(mostRecent.startedAt).getTime() : null;

      const staleDays = p.checkFrequency === "daily" ? 2 : 14;
      const staleMs = staleDays * 24 * 60 * 60 * 1000;

      let health: "ok" | "stale" | "error" | "unknown" = "unknown";
      if (mostRecent?.status === "failed") health = "error";
      else if (ageMs === null) health = "unknown";
      else if (ageMs > staleMs) health = "stale";
      else health = "ok";

      return {
        id: p.id,
        name: p.name,
        domain: p.domain,
        type: p.type,
        checkFrequency: p.checkFrequency,
        priority: p.priority,
        examsConducted: p.examsConducted,
        notes: p.notes,
        // Enrichment
        lastCheckedAt: mostRecent?.startedAt ?? null,
        lastRunStatus: mostRecent?.status ?? null,
        lastRunExamsFound: mostRecent?.examsFound ?? 0,
        health,
      };
    });
  }),

  /**
   * Admin: recent portal_documents (question papers, answer keys,
   * syllabi) — what the discovery + ingestion pipelines actually
   * produced. Each row can be opened in the ingest viewer UI via
   * /scraper/ingest/[documentId] which already exists.
   */
  getRecentPortalDocuments: adminProcedure
    .input(
      z
        .object({
          documentTypes: z.array(z.string()).optional(),
          limit: z.number().int().min(1).max(100).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const types = input?.documentTypes?.length
        ? input.documentTypes
        : [
            "question_paper_mcq",
            "answer_key",
            "syllabus",
            "descriptive_questions",
            "examination_schedule",
          ];

      const rows = await ctx.db
        .select({
          id: portalDocuments.id,
          title: portalDocuments.title,
          documentType: portalDocuments.documentType,
          portalName: portalDocuments.portalName,
          examName: portalDocuments.examName,
          examYear: portalDocuments.examYear,
          examCategory: portalDocuments.examCategory,
          processingStatus: portalDocuments.processingStatus,
          questionsExtracted: portalDocuments.questionsExtracted,
          originalUrl: portalDocuments.originalUrl,
          createdAt: portalDocuments.createdAt,
          updatedAt: portalDocuments.updatedAt,
        })
        .from(portalDocuments)
        .where(inArray(portalDocuments.documentType, types))
        .orderBy(desc(portalDocuments.createdAt))
        .limit(limit);

      return rows;
    }),

  /**
   * Admin: list all exams with their content completeness for the
   * inventory table on the content acquisition dashboard.
   */
  getExamInventory: adminProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          minScore: z.number().int().min(0).max(100).optional(),
          maxScore: z.number().int().min(0).max(100).optional(),
          sortBy: z
            .enum(["completeness", "name", "papersFound", "updatedAt"])
            .default("completeness"),
          limit: z.number().int().min(1).max(200).default(100),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const search = input?.search?.trim() || undefined;
      const sortBy = input?.sortBy ?? "completeness";
      const limit = input?.limit ?? 100;

      const conditions = [];
      if (search) conditions.push(ilike(exams.name, `%${search}%`));

      const rows = await ctx.db
        .select({
          id: exams.id,
          name: exams.name,
          category: exams.category,
          conductingBody: exams.conductingBody,
          status: exams.status,
          isAutoDiscovered: exams.isAutoDiscovered,
          lastCheckedAt: exams.lastCheckedAt,
          questionCount: exams.questionCount,
          contentCompleteness: exams.contentCompleteness,
          updatedAt: exams.updatedAt,
        })
        .from(exams)
        .where(conditions.length ? and(...conditions) : undefined)
        .limit(limit);

      // Sort client-side on the completeness score since it's in JSONB.
      const mapped = rows.map((r) => {
        const c = (r.contentCompleteness as Record<string, unknown>) ?? {};
        const score = Number(c.completenessScore ?? 0);
        const papersFound = Number(c.previousPapersFound ?? 0);
        const papersYears = Array.isArray(c.previousPapersYears)
          ? (c.previousPapersYears as number[])
          : [];
        const missing = Array.isArray(c.missingPaperYears) ? (c.missingPaperYears as number[]) : [];
        return {
          ...r,
          completenessScore: score,
          previousPapersFound: papersFound,
          previousPapersYears: papersYears,
          answerKeysFound: Number(c.answerKeysFound ?? 0),
          syllabusFound: Boolean(c.syllabusFound ?? false),
          syllabusProcessed: Boolean(c.syllabusProcessed ?? false),
          patternGenerated: Boolean(c.patternGenerated ?? false),
          patternConfidence: Number(c.patternConfidence ?? 0),
          missingPaperYears: missing,
        };
      });

      mapped.sort((a, b) => {
        switch (sortBy) {
          case "name":
            return a.name.localeCompare(b.name);
          case "papersFound":
            return b.previousPapersFound - a.previousPapersFound;
          case "updatedAt":
            return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0);
          case "completeness":
          default:
            return b.completenessScore - a.completenessScore;
        }
      });

      if (input?.minScore !== undefined || input?.maxScore !== undefined) {
        return mapped.filter(
          (e) =>
            e.completenessScore >= (input.minScore ?? 0) &&
            e.completenessScore <= (input.maxScore ?? 100),
        );
      }
      return mapped;
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

  /** Protected: list exams for the current user (role-aware) with metadata */
  listForUser: protectedProcedure
    .input(z.object({ search: z.string().max(200).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const isAdmin = ctx.userRole === "admin" || ctx.userRole === "superadmin";
      const search = input?.search;

      const baseSelect = {
        id: exams.id,
        name: exams.name,
        category: exams.category,
        conductingBody: exams.conductingBody,
        examDate: exams.examDate,
        questionCount: exams.questionCount,
        subjects: exams.subjects,
        status: exams.status,
        officialUrl: exams.officialUrl,
      };

      const conditions = [eq(exams.isActive, true)];
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            ilike(exams.name, pattern),
            ilike(exams.conductingBody, pattern),
            ilike(exams.category, pattern),
          )!,
        );
      }

      let examRows;
      if (isAdmin) {
        examRows = await ctx.db
          .select(baseSelect)
          .from(exams)
          .where(and(...conditions))
          .orderBy(asc(exams.name));
      } else {
        // Regular user: only exams they've opted into
        examRows = await ctx.db
          .select(baseSelect)
          .from(exams)
          .innerJoin(
            userExams,
            and(
              eq(userExams.examId, exams.id),
              eq(userExams.userId, ctx.userId),
              eq(userExams.isActive, true),
            ),
          )
          .where(and(...conditions))
          .orderBy(asc(exams.name));
      }

      // Batch-check syllabus availability separately to avoid type issues
      let syllabusExamIds: Set<string> = new Set();
      try {
        const syllabusRows = await ctx.db
          .select({ examId: syllabi.examId })
          .from(syllabi)
          .where(eq(syllabi.status, "parsed"));
        syllabusExamIds = new Set(syllabusRows.map((r) => r.examId));
      } catch {
        // syllabi table may not exist yet
      }

      return examRows.map((e) => ({
        ...e,
        hasSyllabus: syllabusExamIds.has(e.id),
      }));
    }),

  /** Protected: browse exams not yet opted into, with plan limit info */
  listBrowsable: protectedProcedure
    .input(
      z
        .object({
          search: z.string().max(200).optional(),
          category: z.string().max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const search = input?.search;
      const category = input?.category;

      // Get user's current exam IDs
      const userExamRows = await ctx.db
        .select({ examId: userExams.examId })
        .from(userExams)
        .where(and(eq(userExams.userId, ctx.userId), eq(userExams.isActive, true)));

      const userExamIds = userExamRows.map((r) => r.examId);
      const userExamCount = userExamIds.length;

      // Get plan limits
      const [subscription] = await ctx.db
        .select({
          planName: subscriptionPlans.displayName,
          maxExams: subscriptionPlans.maxExams,
        })
        .from(userSubscriptions)
        .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, userSubscriptions.planId))
        .where(
          and(eq(userSubscriptions.userId, ctx.userId), eq(userSubscriptions.status, "active")),
        )
        .limit(1);

      const maxExams = subscription?.maxExams ?? FREE_TIER_MAX_EXAMS;
      const planName = subscription?.planName ?? "Free";

      const conditions = [eq(exams.isActive, true)];
      if (userExamIds.length > 0) {
        conditions.push(notInArray(exams.id, userExamIds));
      }
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(or(ilike(exams.name, pattern), ilike(exams.conductingBody, pattern))!);
      }
      if (category) {
        conditions.push(eq(exams.category, category));
      }

      const examRows = await ctx.db
        .select({
          id: exams.id,
          name: exams.name,
          category: exams.category,
          conductingBody: exams.conductingBody,
          examDate: exams.examDate,
          questionCount: exams.questionCount,
          subjects: exams.subjects,
          status: exams.status,
          officialUrl: exams.officialUrl,
        })
        .from(exams)
        .where(and(...conditions))
        .orderBy(asc(exams.name));

      // Batch-check syllabus availability separately
      let syllabusExamIds: Set<string> = new Set();
      try {
        const syllabusRows = await ctx.db
          .select({ examId: syllabi.examId })
          .from(syllabi)
          .where(eq(syllabi.status, "parsed"));
        syllabusExamIds = new Set(syllabusRows.map((r) => r.examId));
      } catch {
        // syllabi table may not exist yet
      }

      return {
        exams: examRows.map((e) => ({ ...e, hasSyllabus: syllabusExamIds.has(e.id) })),
        userExamCount,
        maxExams,
        planName,
      };
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

  /** Admin: list all exams for generate dropdown (with syllabus + question count) */
  listForAdmin: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: exams.id,
        name: exams.name,
        category: exams.category,
        conductingBody: exams.conductingBody,
        status: exams.status,
        examDate: exams.examDate,
        officialUrl: exams.officialUrl,
        discoverySource: exams.discoverySource,
        isAutoDiscovered: exams.isAutoDiscovered,
        questionCount: exams.questionCount,
        createdAt: exams.createdAt,
      })
      .from(exams)
      .orderBy(desc(exams.createdAt));

    // Get syllabus counts per exam
    const syllabusRows = await ctx.db
      .select({
        examId: syllabi.examId,
        count: count(),
        processedCount: sql<number>`count(*) filter (where ${syllabi.status} = 'parsed')`,
      })
      .from(syllabi)
      .groupBy(syllabi.examId);

    const syllabusMap = new Map(
      syllabusRows.map((r) => [
        r.examId,
        { total: Number(r.count), processed: Number(r.processedCount) },
      ]),
    );

    return rows.map((e) => ({
      ...e,
      hasSyllabus: (syllabusMap.get(e.id)?.processed ?? 0) > 0,
      syllabusCount: syllabusMap.get(e.id)?.total ?? 0,
    }));
  }),

  /** Get exam with linked portal document metadata */
  getWithPortalDetails: adminProcedure
    .input(z.object({ examId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [exam] = await ctx.db.select().from(exams).where(eq(exams.id, input.examId)).limit(1);

      if (!exam) return null;

      // Get portal documents linked to this exam
      const docs = await ctx.db
        .select({
          id: portalDocuments.id,
          title: portalDocuments.title,
          documentType: portalDocuments.documentType,
          sourcePageType: portalDocuments.sourcePageType,
          examName: portalDocuments.examName,
          examCategory: portalDocuments.examCategory,
          portalName: portalDocuments.portalName,
          processingStatus: portalDocuments.processingStatus,
          metadata: portalDocuments.metadata,
          createdAt: portalDocuments.createdAt,
        })
        .from(portalDocuments)
        .where(eq(portalDocuments.examId, input.examId))
        .orderBy(desc(portalDocuments.createdAt));

      // Extract examination entry metadata from the portal docs
      type ExamEntry = {
        examName: string;
        postName?: string;
        categoryNumber?: string;
        examDate?: string;
        examTime?: string;
        venue?: string;
        department?: string;
        stage?: string;
        syllabusUrl?: string;
      };

      let examEntries: ExamEntry[] = [];
      for (const doc of docs) {
        if (doc.documentType === "examination_schedule") {
          const meta = doc.metadata as { examinations?: ExamEntry[] } | null;
          if (meta?.examinations) {
            // Find entries matching this exam by name
            const matching = meta.examinations.filter(
              (e) =>
                e.examName.toLowerCase().includes(exam.name.toLowerCase().slice(0, 30)) ||
                exam.name.toLowerCase().includes(e.examName.toLowerCase().slice(0, 30)),
            );
            if (matching.length > 0) {
              examEntries = [...examEntries, ...matching];
            }
          }
        }
      }

      return {
        exam,
        portalDocuments: docs,
        examEntries,
      };
    }),
});
