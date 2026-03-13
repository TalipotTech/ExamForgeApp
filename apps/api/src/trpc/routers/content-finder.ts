import { z } from "zod";
import { eq, and, desc, ilike, sql } from "drizzle-orm";
import { contentSearches, searchResults, userSavedContent } from "@examforge/shared/db/schema";
import {
  searchQuerySchema,
  saveResultSchema,
  extractQuestionsSchema,
  extractSyllabusSchema,
} from "@examforge/shared/validators";
import { router, protectedProcedure } from "../trpc.js";
import { searchContent } from "../../services/content-search-engine.js";
import { addContentFetchJob } from "../../queues/content-fetch-queue.js";
import { getRedisClient } from "../../lib/redis.js";

// ─── Content Finder Router ───

export const contentFinderRouter = router({
  // ─── Search ───
  search: protectedProcedure.input(searchQuerySchema).mutation(
    async ({
      ctx,
      input,
    }): Promise<{
      searchId: string;
      results: Array<{
        id: string;
        title: string;
        sourceUrl: string;
        sourceName?: string;
        sourceDomain?: string;
        contentType: string;
        snippet?: string;
        matchQuality: string;
        relevanceScore: number;
        sourceQuality: string;
        metadata: Record<string, unknown>;
      }>;
      fromCache: boolean;
      totalResults: number;
    }> => {
      const result = await searchContent(
        {
          userId: ctx.userId,
          query: input.query,
          filters: {
            contentType: input.contentType,
            year: input.year,
            format: input.format,
            examId: input.examId,
          },
        },
        ctx.db,
      );

      return result;
    },
  ),

  // ─── Get Search Results ───
  getSearchResults: protectedProcedure.input(z.object({ searchId: z.string().uuid() })).query(
    async ({
      ctx,
      input,
    }): Promise<{
      search: {
        id: string;
        queryText: string;
        parsedQuery: Record<string, unknown>;
        createdAt: Date;
      } | null;
      results: Array<{
        id: string;
        title: string;
        sourceUrl: string;
        sourceName: string | null;
        sourceDomain: string | null;
        contentType: string;
        snippet: string | null;
        matchQuality: string;
        relevanceScore: number | null;
        sourceQuality: string | null;
        metadata: Record<string, unknown> | null;
        isSaved: boolean | null;
        isExtracted: boolean | null;
        sortOrder: number | null;
      }>;
    }> => {
      const [search] = await ctx.db
        .select({
          id: contentSearches.id,
          queryText: contentSearches.queryText,
          parsedQuery: contentSearches.parsedQuery,
          createdAt: contentSearches.createdAt,
        })
        .from(contentSearches)
        .where(and(eq(contentSearches.id, input.searchId), eq(contentSearches.userId, ctx.userId)))
        .limit(1);

      if (!search) {
        return { search: null, results: [] };
      }

      const results = await ctx.db
        .select()
        .from(searchResults)
        .where(eq(searchResults.searchId, input.searchId))
        .orderBy(searchResults.sortOrder);

      return { search, results };
    },
  ),

  // ─── Preview Result ───
  previewResult: protectedProcedure
    .input(z.object({ resultId: z.string().uuid() }))
    .mutation(async ({ input }): Promise<{ preview: string }> => {
      const redis = getRedisClient();
      const cacheKey = `preview:${input.resultId}`;

      // Check cache
      const cached = await redis.get(cacheKey).catch(() => null);
      if (cached) return { preview: cached };

      // Queue fetch job and wait
      const jobId = await addContentFetchJob(
        { type: "preview", resultId: input.resultId },
        { priority: 1 },
      );

      // Poll for result (max 30s)
      const startTime = Date.now();
      while (Date.now() - startTime < 30000) {
        const result = await redis.get(cacheKey).catch(() => null);
        if (result) return { preview: result };
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      return {
        preview: `Preview is being generated (job: ${jobId}). Please try again in a moment.`,
      };
    }),

  // ─── Extract Questions ───
  extractQuestions: protectedProcedure
    .input(extractQuestionsSchema)
    .mutation(async ({ ctx, input }): Promise<{ questions: unknown[]; jobId: string }> => {
      const jobId = await addContentFetchJob({
        type: "extract_questions",
        resultId: input.resultId,
        provider: input.provider,
        userId: ctx.userId,
      });

      // Poll for extracted questions (max 60s)
      const redis = getRedisClient();
      const cacheKey = `extracted:questions:${input.resultId}`;
      const startTime = Date.now();

      while (Date.now() - startTime < 60000) {
        const result = await redis.get(cacheKey).catch(() => null);
        if (result) {
          try {
            const parsed = JSON.parse(result) as { questions: unknown[] };
            return { questions: parsed.questions, jobId };
          } catch {
            /* continue polling */
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      return { questions: [], jobId };
    }),

  // ─── Save Extracted Questions ───
  saveExtractedQuestions: protectedProcedure
    .input(
      z.object({
        resultId: z.string().uuid(),
        questions: z.array(z.record(z.any())),
        examId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ savedCount: number }> => {
      // Update search result
      await ctx.db
        .update(searchResults)
        .set({
          isExtracted: true,
          extractionCount: input.questions.length,
        })
        .where(eq(searchResults.id, input.resultId));

      // TODO: Save individual questions to questions table
      // with owner_type='user', owner_id=ctx.userId, examId=input.examId

      return { savedCount: input.questions.length };
    }),

  // ─── Extract Syllabus ───
  extractSyllabus: protectedProcedure
    .input(extractSyllabusSchema)
    .mutation(async ({ ctx, input }): Promise<{ syllabus: unknown; jobId: string }> => {
      const jobId = await addContentFetchJob({
        type: "extract_syllabus",
        resultId: input.resultId,
        provider: input.provider,
        userId: ctx.userId,
      });

      const redis = getRedisClient();
      const cacheKey = `extracted:syllabus:${input.resultId}`;
      const startTime = Date.now();

      while (Date.now() - startTime < 60000) {
        const result = await redis.get(cacheKey).catch(() => null);
        if (result) {
          try {
            const parsed = JSON.parse(result) as { syllabus: unknown };
            return { syllabus: parsed.syllabus, jobId };
          } catch {
            /* continue polling */
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      return { syllabus: null, jobId };
    }),

  // ─── Save Result (bookmark/download/extract) ───
  saveResult: protectedProcedure
    .input(saveResultSchema)
    .mutation(async ({ ctx, input }): Promise<{ savedContentId: string }> => {
      // Get search result details
      const [result] = await ctx.db
        .select({
          title: searchResults.title,
          sourceUrl: searchResults.sourceUrl,
          sourceName: searchResults.sourceName,
          contentType: searchResults.contentType,
        })
        .from(searchResults)
        .where(eq(searchResults.id, input.resultId))
        .limit(1);

      if (!result) throw new Error("Search result not found");

      if (input.saveType === "bookmark") {
        // Save metadata only
        const [saved] = await ctx.db
          .insert(userSavedContent)
          .values({
            userId: ctx.userId,
            searchResultId: input.resultId,
            title: result.title,
            sourceUrl: result.sourceUrl,
            sourceName: result.sourceName,
            contentType: result.contentType,
            savedType: "bookmark",
            examId: input.examId,
            tags: input.tags ?? [],
            ownerType: "user",
            ownerId: ctx.userId,
          })
          .returning({ id: userSavedContent.id });

        await ctx.db
          .update(searchResults)
          .set({ isSaved: true })
          .where(eq(searchResults.id, input.resultId));

        return { savedContentId: saved!.id };
      }

      // For download_pdf and extract_text, queue background jobs
      const jobType = input.saveType === "download_pdf" ? "download_pdf" : "extract_text";
      await addContentFetchJob({
        type: jobType,
        resultId: input.resultId,
        userId: ctx.userId,
      });

      // Create a placeholder saved content entry
      const [saved] = await ctx.db
        .insert(userSavedContent)
        .values({
          userId: ctx.userId,
          searchResultId: input.resultId,
          title: result.title,
          sourceUrl: result.sourceUrl,
          sourceName: result.sourceName,
          contentType: result.contentType,
          savedType: input.saveType,
          examId: input.examId,
          tags: input.tags ?? [],
          ownerType: "user",
          ownerId: ctx.userId,
        })
        .returning({ id: userSavedContent.id });

      await ctx.db
        .update(searchResults)
        .set({ isSaved: true })
        .where(eq(searchResults.id, input.resultId));

      return { savedContentId: saved!.id };
    }),

  // ─── Unsave Result ───
  unsaveResult: protectedProcedure
    .input(z.object({ savedContentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      const [saved] = await ctx.db
        .select({
          id: userSavedContent.id,
          searchResultId: userSavedContent.searchResultId,
        })
        .from(userSavedContent)
        .where(
          and(
            eq(userSavedContent.id, input.savedContentId),
            eq(userSavedContent.userId, ctx.userId),
          ),
        )
        .limit(1);

      if (!saved) throw new Error("Saved content not found");

      await ctx.db.delete(userSavedContent).where(eq(userSavedContent.id, input.savedContentId));

      if (saved.searchResultId) {
        await ctx.db
          .update(searchResults)
          .set({ isSaved: false })
          .where(eq(searchResults.id, saved.searchResultId));
      }

      return { success: true };
    }),

  // ─── List Saved Content ───
  listSaved: protectedProcedure
    .input(
      z.object({
        contentType: z.string().optional(),
        examId: z.string().uuid().optional(),
        search: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      }),
    )
    .query(
      async ({
        ctx,
        input,
      }): Promise<{
        items: Array<{
          id: string;
          title: string;
          sourceUrl: string | null;
          sourceName: string | null;
          contentType: string;
          savedType: string;
          examId: string | null;
          tags: string[] | null;
          questionsExtracted: number | null;
          createdAt: Date;
        }>;
        total: number;
        page: number;
        totalPages: number;
      }> => {
        const offset = (input.page - 1) * input.limit;
        const conditions = [eq(userSavedContent.userId, ctx.userId)];

        if (input.contentType) {
          conditions.push(eq(userSavedContent.contentType, input.contentType));
        }
        if (input.examId) {
          conditions.push(eq(userSavedContent.examId, input.examId));
        }
        if (input.search) {
          conditions.push(ilike(userSavedContent.title, `%${input.search}%`));
        }

        const whereClause = and(...conditions);

        const [items, [countResult]] = await Promise.all([
          ctx.db
            .select({
              id: userSavedContent.id,
              title: userSavedContent.title,
              sourceUrl: userSavedContent.sourceUrl,
              sourceName: userSavedContent.sourceName,
              contentType: userSavedContent.contentType,
              savedType: userSavedContent.savedType,
              examId: userSavedContent.examId,
              tags: userSavedContent.tags,
              questionsExtracted: userSavedContent.questionsExtracted,
              createdAt: userSavedContent.createdAt,
            })
            .from(userSavedContent)
            .where(whereClause)
            .orderBy(desc(userSavedContent.createdAt))
            .limit(input.limit)
            .offset(offset),
          ctx.db
            .select({ count: sql<number>`count(*)::int` })
            .from(userSavedContent)
            .where(whereClause),
        ]);

        const total = countResult?.count ?? 0;

        return {
          items,
          total,
          page: input.page,
          totalPages: Math.ceil(total / input.limit),
        };
      },
    ),

  // ─── Get Saved By ID ───
  getSavedById: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(
    async ({
      ctx,
      input,
    }): Promise<{
      id: string;
      title: string;
      sourceUrl: string | null;
      sourceName: string | null;
      contentType: string;
      savedType: string;
      rawText: string | null;
      metadata: Record<string, unknown> | null;
      tags: string[] | null;
      createdAt: Date;
    } | null> => {
      const [item] = await ctx.db
        .select({
          id: userSavedContent.id,
          title: userSavedContent.title,
          sourceUrl: userSavedContent.sourceUrl,
          sourceName: userSavedContent.sourceName,
          contentType: userSavedContent.contentType,
          savedType: userSavedContent.savedType,
          rawText: userSavedContent.rawText,
          metadata: userSavedContent.metadata,
          tags: userSavedContent.tags,
          createdAt: userSavedContent.createdAt,
        })
        .from(userSavedContent)
        .where(and(eq(userSavedContent.id, input.id), eq(userSavedContent.userId, ctx.userId)))
        .limit(1);

      return item ?? null;
    },
  ),

  // ─── Search History ───
  getSearchHistory: protectedProcedure.input(z.object({ limit: z.number().default(20) })).query(
    async ({
      ctx,
      input,
    }): Promise<
      Array<{
        id: string;
        queryText: string;
        resultsCount: number | null;
        createdAt: Date;
      }>
    > => {
      const history = await ctx.db
        .select({
          id: contentSearches.id,
          queryText: contentSearches.queryText,
          resultsCount: contentSearches.resultsCount,
          createdAt: contentSearches.createdAt,
        })
        .from(contentSearches)
        .where(eq(contentSearches.userId, ctx.userId))
        .orderBy(desc(contentSearches.createdAt))
        .limit(input.limit);

      return history;
    },
  ),
});
