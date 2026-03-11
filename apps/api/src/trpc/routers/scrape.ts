import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { scrapeSources, exams } from "@examforge/shared/db/schema";
import type { ScrapeSourceConfig } from "@examforge/shared/db/schema";
import { router, protectedProcedure } from "../trpc.js";
import {
  addScrapeJob,
  scheduleScrapeJob,
  unscheduleScrapeJob,
  getScraperQueue,
} from "../../queues/scraper-queue.js";

// ─── Input Schemas ───

const scrapeSourceConfigSchema = z.object({
  crawlerType: z.enum(["cheerio", "playwright"]).optional(),
  maxPages: z.number().int().min(1).max(500).optional(),
  fetchDelayMs: z.number().int().min(500).max(30000).optional(),
  urlPatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  contentSelector: z.string().optional(),
  defaultSubject: z.string().optional(),
  defaultDifficulty: z.enum(["easy", "medium", "hard"]).optional(),
  questionTypes: z
    .array(z.enum(["mcq", "true_false", "fill_blank", "match", "assertion"]))
    .optional(),
});

const createSourceSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  examId: z.string().uuid(),
  config: scrapeSourceConfigSchema.optional(),
});

const updateSourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  url: z.string().url().optional(),
  examId: z.string().uuid().optional(),
  config: scrapeSourceConfigSchema.optional(),
});

// ─── Router ───

export const scrapeRouter = router({
  /** List all scrape sources for the current org */
  list: protectedProcedure.query(
    async ({
      ctx,
    }): Promise<
      Array<{
        id: string;
        name: string;
        url: string;
        status: string;
        lastScrapedAt: Date | null;
        questionsCount: number;
        config: ScrapeSourceConfig;
        examId: string | null;
        examName: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>
    > => {
      const rows = await ctx.db
        .select({
          id: scrapeSources.id,
          name: scrapeSources.name,
          url: scrapeSources.url,
          status: scrapeSources.status,
          lastScrapedAt: scrapeSources.lastScrapedAt,
          questionsCount: scrapeSources.questionsCount,
          config: scrapeSources.config,
          examId: scrapeSources.examId,
          examName: exams.name,
          createdAt: scrapeSources.createdAt,
          updatedAt: scrapeSources.updatedAt,
        })
        .from(scrapeSources)
        .leftJoin(exams, eq(scrapeSources.examId, exams.id))
        .where(ctx.orgId ? eq(scrapeSources.orgId, ctx.orgId) : undefined)
        .orderBy(desc(scrapeSources.createdAt));

      return rows.map((r) => ({
        ...r,
        config: (r.config ?? {}) as ScrapeSourceConfig,
      }));
    },
  ),

  /** Get a single scrape source by ID */
  getById: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(
    async ({
      ctx,
      input,
    }): Promise<{
      id: string;
      name: string;
      url: string;
      status: string;
      lastScrapedAt: Date | null;
      questionsCount: number;
      config: ScrapeSourceConfig;
      examId: string | null;
      examName: string | null;
      createdAt: Date;
      updatedAt: Date;
    } | null> => {
      const conditions = [eq(scrapeSources.id, input.id)];
      if (ctx.orgId) {
        conditions.push(eq(scrapeSources.orgId, ctx.orgId));
      }

      const [row] = await ctx.db
        .select({
          id: scrapeSources.id,
          name: scrapeSources.name,
          url: scrapeSources.url,
          status: scrapeSources.status,
          lastScrapedAt: scrapeSources.lastScrapedAt,
          questionsCount: scrapeSources.questionsCount,
          config: scrapeSources.config,
          examId: scrapeSources.examId,
          examName: exams.name,
          createdAt: scrapeSources.createdAt,
          updatedAt: scrapeSources.updatedAt,
        })
        .from(scrapeSources)
        .leftJoin(exams, eq(scrapeSources.examId, exams.id))
        .where(and(...conditions))
        .limit(1);

      if (!row) return null;

      return {
        ...row,
        config: (row.config ?? {}) as ScrapeSourceConfig,
      };
    },
  ),

  /** Create a new scrape source */
  create: protectedProcedure
    .input(createSourceSchema)
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const [row] = await ctx.db
        .insert(scrapeSources)
        .values({
          name: input.name,
          url: input.url,
          examId: input.examId,
          config: (input.config ?? {}) as ScrapeSourceConfig,
          orgId: ctx.orgId,
        })
        .returning({ id: scrapeSources.id });

      return { id: row!.id };
    }),

  /** Update an existing scrape source */
  update: protectedProcedure
    .input(updateSourceSchema)
    .mutation(async ({ ctx, input }): Promise<{ success: true }> => {
      const conditions = [eq(scrapeSources.id, input.id)];
      if (ctx.orgId) {
        conditions.push(eq(scrapeSources.orgId, ctx.orgId));
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.url !== undefined) updates.url = input.url;
      if (input.examId !== undefined) updates.examId = input.examId;
      if (input.config !== undefined) updates.config = input.config;

      await ctx.db
        .update(scrapeSources)
        .set(updates)
        .where(and(...conditions));

      return { success: true };
    }),

  /** Delete a scrape source */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ success: true }> => {
      const conditions = [eq(scrapeSources.id, input.id)];
      if (ctx.orgId) {
        conditions.push(eq(scrapeSources.orgId, ctx.orgId));
      }

      // Unschedule any active cron job
      try {
        await unscheduleScrapeJob(input.id);
      } catch {
        // Ignore if no schedule exists
      }

      await ctx.db.delete(scrapeSources).where(and(...conditions));

      return { success: true };
    }),

  /** Trigger a manual scrape for a source */
  trigger: protectedProcedure
    .input(z.object({ sourceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ jobId: string }> => {
      const conditions = [eq(scrapeSources.id, input.sourceId)];
      if (ctx.orgId) {
        conditions.push(eq(scrapeSources.orgId, ctx.orgId));
      }

      const [source] = await ctx.db
        .select()
        .from(scrapeSources)
        .where(and(...conditions))
        .limit(1);

      if (!source) {
        throw new Error("Source not found");
      }

      if (source.status === "active") {
        throw new Error("A scrape is already in progress for this source");
      }

      const config = (source.config ?? {}) as ScrapeSourceConfig;

      const jobId = await addScrapeJob({
        sourceId: source.id,
        url: source.url,
        examId: source.examId!,
        orgId: ctx.orgId ?? "",
        userId: ctx.userId,
        maxPages: config.maxPages ?? 50,
      });

      return { jobId };
    }),

  /** Get job progress by BullMQ job ID */
  getJobProgress: protectedProcedure.input(z.object({ jobId: z.string() })).query(
    async ({
      input,
    }): Promise<{
      state: string | null;
      progress: {
        pagesVisited: number;
        pagesTotal: number;
        questionsFound: number;
        duplicatesSkipped: number;
        errorsCount: number;
        currentPage?: string;
        status: string;
      } | null;
      failedReason: string | null;
    }> => {
      const queue = getScraperQueue();
      const job = await queue.getJob(input.jobId);

      if (!job) {
        return { state: null, progress: null, failedReason: null };
      }

      const state = await job.getState();
      const progress = job.progress as {
        pagesVisited: number;
        pagesTotal: number;
        questionsFound: number;
        duplicatesSkipped: number;
        errorsCount: number;
        currentPage?: string;
        status: string;
      } | null;

      return {
        state: state ?? null,
        progress: progress && typeof progress === "object" ? progress : null,
        failedReason: job.failedReason ?? null,
      };
    },
  ),

  /** Update schedule for a source */
  updateSchedule: protectedProcedure
    .input(
      z.object({
        sourceId: z.string().uuid(),
        enabled: z.boolean(),
        cron: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ success: true }> => {
      const conditions = [eq(scrapeSources.id, input.sourceId)];
      if (ctx.orgId) {
        conditions.push(eq(scrapeSources.orgId, ctx.orgId));
      }

      const [source] = await ctx.db
        .select()
        .from(scrapeSources)
        .where(and(...conditions))
        .limit(1);

      if (!source) {
        throw new Error("Source not found");
      }

      const config = (source.config ?? {}) as ScrapeSourceConfig;
      const updatedConfig: ScrapeSourceConfig = {
        ...config,
        schedule: {
          enabled: input.enabled,
          cron: input.cron ?? config.schedule?.cron ?? "0 2 * * 0",
        },
      };

      await ctx.db
        .update(scrapeSources)
        .set({ config: updatedConfig, updatedAt: new Date() })
        .where(eq(scrapeSources.id, input.sourceId));

      if (input.enabled && input.cron) {
        await scheduleScrapeJob(
          input.sourceId,
          {
            sourceId: source.id,
            url: source.url,
            examId: source.examId!,
            orgId: ctx.orgId ?? "",
            userId: ctx.userId,
            maxPages: config.maxPages ?? 50,
          },
          input.cron,
        );
      } else {
        try {
          await unscheduleScrapeJob(input.sourceId);
        } catch {
          // Ignore
        }
      }

      return { success: true };
    }),

  /** List active exams (for source creation dropdown) */
  exams: protectedProcedure.query(async ({ ctx }): Promise<Array<{ id: string; name: string }>> => {
    return ctx.db
      .select({ id: exams.id, name: exams.name })
      .from(exams)
      .where(eq(exams.isActive, true))
      .orderBy(exams.name);
  }),
});
