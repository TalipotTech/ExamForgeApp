import { z } from "zod";
import { eq, and, desc, ilike, or, count, sql, gte } from "drizzle-orm";
import { scrapeSources, scrapeRuns, exams } from "@examforge/shared/db/schema";
import {
  createScrapeSourceSchema,
  updateScrapeSourceSchema,
  scrapeSourceFilterSchema,
  extractedQuestionsResponseSchema,
  sourceAnalysisResponseSchema,
} from "@examforge/shared/validators";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc.js";
import { addScrapeJob } from "../../queues/scraper-queue.js";
import { crawlPages } from "../../workers/scraper/crawler.js";
import { buildQuestionExtractionPrompt } from "../../ai/prompts/question-extraction.js";
import { buildSourceAnalysisPrompt } from "../../ai/prompts/source-analysis.js";
import { routeAIRequest } from "../../ai/ai-router.js";

export const scrapeSourceRouter = router({
  /** Create a new scrape source */
  create: adminProcedure.input(createScrapeSourceSchema).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.db
      .insert(scrapeSources)
      .values({
        name: input.name,
        url: input.url,
        examId: input.examId ?? null,
        sourceType: input.sourceType,
        scrapeFrequency: input.scrapeFrequency,
        scrapeDepth: input.scrapeDepth,
        contentFormat: input.contentFormat,
        aiProvider: input.aiProvider,
        notes: input.notes ?? null,
        config: input.config ?? {},
        orgId: ctx.orgId,
      })
      .returning();

    return created!;
  }),

  /** Update an existing scrape source */
  update: adminProcedure.input(updateScrapeSourceSchema).mutation(async ({ ctx, input }) => {
    const { id, ...updates } = input;

    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name !== undefined) setValues.name = updates.name;
    if (updates.url !== undefined) setValues.url = updates.url;
    if (updates.examId !== undefined) setValues.examId = updates.examId;
    if (updates.sourceType !== undefined) setValues.sourceType = updates.sourceType;
    if (updates.scrapeFrequency !== undefined) setValues.scrapeFrequency = updates.scrapeFrequency;
    if (updates.scrapeDepth !== undefined) setValues.scrapeDepth = updates.scrapeDepth;
    if (updates.contentFormat !== undefined) setValues.contentFormat = updates.contentFormat;
    if (updates.aiProvider !== undefined) setValues.aiProvider = updates.aiProvider;
    if (updates.notes !== undefined) setValues.notes = updates.notes;
    if (updates.config !== undefined) setValues.config = updates.config;

    await ctx.db
      .update(scrapeSources)
      .set(setValues)
      .where(and(eq(scrapeSources.id, id), eq(scrapeSources.orgId, ctx.orgId!)));

    return { success: true };
  }),

  /** Delete a scrape source (cascade deletes scrape_runs) */
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(scrapeSources)
        .where(and(eq(scrapeSources.id, input.id), eq(scrapeSources.orgId, ctx.orgId!)));

      return { success: true };
    }),

  /** List scrape sources with filters */
  list: adminProcedure.input(scrapeSourceFilterSchema.optional()).query(async ({ ctx, input }) => {
    const conditions = [eq(scrapeSources.orgId, ctx.orgId!)];

    if (input?.examId) {
      conditions.push(eq(scrapeSources.examId, input.examId));
    }
    if (input?.status) {
      conditions.push(eq(scrapeSources.status, input.status));
    }
    if (input?.sourceType) {
      conditions.push(eq(scrapeSources.sourceType, input.sourceType));
    }
    if (input?.search) {
      const pattern = `%${input.search}%`;
      conditions.push(or(ilike(scrapeSources.name, pattern), ilike(scrapeSources.url, pattern))!);
    }

    const rows = await ctx.db
      .select({
        id: scrapeSources.id,
        name: scrapeSources.name,
        url: scrapeSources.url,
        status: scrapeSources.status,
        lastScrapedAt: scrapeSources.lastScrapedAt,
        questionsCount: scrapeSources.questionsCount,
        sourceType: scrapeSources.sourceType,
        scrapeFrequency: scrapeSources.scrapeFrequency,
        scrapeDepth: scrapeSources.scrapeDepth,
        aiProvider: scrapeSources.aiProvider,
        totalRuns: scrapeSources.totalRuns,
        successfulRuns: scrapeSources.successfulRuns,
        totalQuestionsScraped: scrapeSources.totalQuestionsScraped,
        lastError: scrapeSources.lastError,
        notes: scrapeSources.notes,
        tags: scrapeSources.tags,
        examId: scrapeSources.examId,
        examName: exams.name,
        createdAt: scrapeSources.createdAt,
      })
      .from(scrapeSources)
      .leftJoin(exams, eq(scrapeSources.examId, exams.id))
      .where(and(...conditions))
      .orderBy(desc(scrapeSources.createdAt));

    return rows;
  }),

  /** Get a single source by ID with last 5 runs */
  getById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [source] = await ctx.db
        .select({
          id: scrapeSources.id,
          name: scrapeSources.name,
          url: scrapeSources.url,
          status: scrapeSources.status,
          lastScrapedAt: scrapeSources.lastScrapedAt,
          questionsCount: scrapeSources.questionsCount,
          config: scrapeSources.config,
          sourceType: scrapeSources.sourceType,
          scrapeFrequency: scrapeSources.scrapeFrequency,
          scrapeDepth: scrapeSources.scrapeDepth,
          contentFormat: scrapeSources.contentFormat,
          aiProvider: scrapeSources.aiProvider,
          totalRuns: scrapeSources.totalRuns,
          successfulRuns: scrapeSources.successfulRuns,
          totalQuestionsScraped: scrapeSources.totalQuestionsScraped,
          lastError: scrapeSources.lastError,
          nextRunAt: scrapeSources.nextRunAt,
          notes: scrapeSources.notes,
          tags: scrapeSources.tags,
          examId: scrapeSources.examId,
          examName: exams.name,
          createdAt: scrapeSources.createdAt,
          updatedAt: scrapeSources.updatedAt,
        })
        .from(scrapeSources)
        .leftJoin(exams, eq(scrapeSources.examId, exams.id))
        .where(and(eq(scrapeSources.id, input.id), eq(scrapeSources.orgId, ctx.orgId!)))
        .limit(1);

      if (!source) return null;

      const recentRuns = await ctx.db
        .select()
        .from(scrapeRuns)
        .where(eq(scrapeRuns.sourceId, input.id))
        .orderBy(desc(scrapeRuns.startedAt))
        .limit(5);

      return { ...source, recentRuns };
    }),

  /** Test scrape — fetches a single page and runs AI extraction */
  testScrape: adminProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Crawl a single page
      const pages = await crawlPages({
        startUrl: input.url,
        maxPages: 1,
        crawlerType: "cheerio",
        fetchDelayMs: 0,
      });

      if (pages.length === 0) {
        return {
          questionsFound: 0,
          pageTitle: "Failed to fetch page",
          preview: [],
          error: "Could not fetch the URL. Check if the URL is accessible.",
        };
      }

      const page = pages[0]!;

      if (!page.textContent || page.textContent.trim().length < 50) {
        return {
          questionsFound: 0,
          pageTitle: page.title || "Untitled",
          preview: [],
          error: "Page has insufficient text content for question extraction.",
        };
      }

      // 2. Run AI extraction
      const { systemPrompt, prompt } = buildQuestionExtractionPrompt(page.textContent, {
        examName: "General",
        subjects: [],
        questionTypes: ["mcq", "true_false", "fill_blank", "match", "assertion"],
      });

      const aiResult = await routeAIRequest(
        {
          task: "extract_questions_from_web",
          prompt,
          systemPrompt,
          schema: extractedQuestionsResponseSchema,
          userId: ctx.userId,
          skipCache: true,
          temperature: 0.1,
        },
        ctx.db,
      );

      const extracted = aiResult.data;

      // 3. Return preview results
      return {
        questionsFound: extracted.questions.length,
        pageTitle: page.title || "Untitled",
        pageRelevance: extracted.pageRelevance,
        preview: extracted.questions.slice(0, 5).map((q) => {
          const c = q.content;
          if (c.type === "mcq") {
            return {
              question: c.question,
              options: c.options,
              answer: c.answer,
              type: c.type,
              subject: q.subject,
              difficulty: q.difficulty,
            };
          }
          return {
            question: "question" in c ? (c as { question: string }).question : `[${c.type}]`,
            type: c.type,
            subject: q.subject,
            difficulty: q.difficulty,
          };
        }),
        aiProvider: aiResult.provider,
        aiModel: aiResult.model,
        tokensUsed: aiResult.usage.totalTokens,
        estimatedCost: aiResult.estimatedCostUsd,
      };
    }),

  /** Start a real scrape — creates scrape_run and queues BullMQ job */
  startScrape: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify source exists and get data
      const [source] = await ctx.db
        .select()
        .from(scrapeSources)
        .where(and(eq(scrapeSources.id, input.id), eq(scrapeSources.orgId, ctx.orgId!)))
        .limit(1);

      if (!source) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });
      }

      if (!source.examId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Source must be linked to an exam before scraping. Please edit the source and select a target exam.",
        });
      }

      // Create a scrape run record
      const [run] = await ctx.db
        .insert(scrapeRuns)
        .values({
          sourceId: source.id,
          status: "queued",
          aiProvider: source.aiProvider ?? "auto",
        })
        .returning();

      // Update source status
      await ctx.db
        .update(scrapeSources)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(scrapeSources.id, source.id));

      // Queue the BullMQ job
      try {
        const jobId = await addScrapeJob({
          sourceId: source.id,
          runId: run!.id,
          url: source.url,
          examId: source.examId,
          orgId: ctx.orgId ?? "",
          userId: ctx.userId,
          maxPages: source.config?.maxPages ?? source.scrapeDepth ?? 1,
        });

        return { runId: run!.id, jobId };
      } catch (err) {
        // If BullMQ/Redis fails, update the run to failed and report
        await ctx.db
          .update(scrapeRuns)
          .set({ status: "failed", completedAt: new Date() })
          .where(eq(scrapeRuns.id, run!.id));

        await ctx.db
          .update(scrapeSources)
          .set({
            status: "error",
            lastError: "Failed to queue scrape job — is Redis running?",
            updatedAt: new Date(),
          })
          .where(eq(scrapeSources.id, source.id));

        const errMsg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to queue scrape job: ${errMsg}. Make sure Redis is running.`,
        });
      }
    }),

  /** Toggle source between active and paused */
  pauseSource: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [source] = await ctx.db
        .select({ status: scrapeSources.status })
        .from(scrapeSources)
        .where(and(eq(scrapeSources.id, input.id), eq(scrapeSources.orgId, ctx.orgId!)))
        .limit(1);

      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });

      const newStatus = source.status === "paused" ? "active" : "paused";

      await ctx.db
        .update(scrapeSources)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(scrapeSources.id, input.id));

      return { status: newStatus };
    }),

  /** Get scrape runs for a source */
  getRuns: adminProcedure
    .input(
      z.object({ sourceId: z.string().uuid(), limit: z.number().int().min(1).max(50).default(10) }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(scrapeRuns)
        .where(eq(scrapeRuns.sourceId, input.sourceId))
        .orderBy(desc(scrapeRuns.startedAt))
        .limit(input.limit);
    }),

  /** Aggregate stats for the scraper dashboard */
  getStats: adminProcedure.query(async ({ ctx }) => {
    const [totalResult] = await ctx.db
      .select({ count: count() })
      .from(scrapeSources)
      .where(eq(scrapeSources.orgId, ctx.orgId!));

    const [activeResult] = await ctx.db
      .select({ count: count() })
      .from(scrapeSources)
      .where(and(eq(scrapeSources.orgId, ctx.orgId!), eq(scrapeSources.status, "active")));

    const [questionsResult] = await ctx.db
      .select({ total: sql<number>`COALESCE(SUM(${scrapeSources.totalQuestionsScraped}), 0)` })
      .from(scrapeSources)
      .where(eq(scrapeSources.orgId, ctx.orgId!));

    // Today's yield: questions found from runs that started today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayResult] = await ctx.db
      .select({ total: sql<number>`COALESCE(SUM(${scrapeRuns.questionsNew}), 0)` })
      .from(scrapeRuns)
      .innerJoin(scrapeSources, eq(scrapeRuns.sourceId, scrapeSources.id))
      .where(and(eq(scrapeSources.orgId, ctx.orgId!), gte(scrapeRuns.startedAt, todayStart)));

    return {
      totalSources: totalResult?.count ?? 0,
      activeSources: activeResult?.count ?? 0,
      totalQuestionsScraped: Number(questionsResult?.total ?? 0),
      todayYield: Number(todayResult?.total ?? 0),
    };
  }),

  /** Analyze a URL to determine its value as a question source */
  analyzeSource: adminProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const pages = await crawlPages({
        startUrl: input.url,
        maxPages: 1,
        crawlerType: "cheerio",
        fetchDelayMs: 0,
      });

      if (pages.length === 0) {
        return {
          isQuestionSource: false,
          estimatedQuestions: 0,
          subjectsFound: [],
          questionTypes: [],
          contentQuality: "low" as const,
          suggestedSelector: null,
          suggestedDepth: 1,
          suggestedPatterns: [],
          notes: "Could not fetch the URL. Check if the URL is accessible.",
        };
      }

      const page = pages[0]!;
      const { systemPrompt, prompt } = buildSourceAnalysisPrompt(page.textContent, input.url);

      const aiResult = await routeAIRequest(
        {
          task: "analyze_source",
          prompt,
          systemPrompt,
          schema: sourceAnalysisResponseSchema,
          userId: ctx.userId,
          skipCache: true,
          temperature: 0.1,
        },
        ctx.db,
      );

      return aiResult.data;
    }),

  /** Get detailed log for a specific scrape run */
  getRunLog: adminProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(scrapeRuns)
        .where(eq(scrapeRuns.id, input.runId))
        .limit(1);

      if (!run) return null;
      return run;
    }),

  /** List active exams for dropdown */
  exams: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({ id: exams.id, name: exams.name })
      .from(exams)
      .where(eq(exams.isActive, true))
      .orderBy(exams.name);
  }),
});
