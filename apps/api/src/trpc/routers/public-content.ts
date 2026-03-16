import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import {
  syllabi,
  syllabusNodes,
  exams,
  topicNoteSummaries,
  tutorialFiles,
  users,
  questions,
} from "@examforge/shared/db/schema";

export const publicContentRouter = router({
  // ─── Get Public Exam Topics ───
  // Returns exam names with topic lists that have public summaries
  getPublicExamTopics: publicProcedure
    .input(
      z.object({
        examSlug: z.string().min(1).max(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Find exam by slug (name lowercased, spaces → hyphens)
      const allExams = await ctx.db
        .select({
          id: exams.id,
          name: exams.name,
        })
        .from(exams)
        .where(eq(exams.isActive, true));

      const exam = allExams.find((e) => slugify(e.name) === input.examSlug);

      if (!exam) {
        return { exam: null, topics: [] };
      }

      // Get syllabi for this exam
      const examSyllabi = await ctx.db
        .select({ id: syllabi.id, name: syllabi.name })
        .from(syllabi)
        .where(eq(syllabi.examId, exam.id));

      if (examSyllabi.length === 0) {
        return { exam: { id: exam.id, name: exam.name, slug: input.examSlug }, topics: [] };
      }

      const syllabusIds = examSyllabi.map((s) => s.id);

      // Get nodes that have public summaries or tutorials
      const nodes = await ctx.db
        .select({
          id: syllabusNodes.id,
          title: syllabusNodes.title,
          slug: syllabusNodes.slug,
          depth: syllabusNodes.depth,
          sortOrder: syllabusNodes.sortOrder,
          parentId: syllabusNodes.parentId,
          syllabusId: syllabusNodes.syllabusId,
          publicSummaryAvailable: syllabusNodes.publicSummaryAvailable,
        })
        .from(syllabusNodes)
        .where(
          sql`${syllabusNodes.syllabusId} IN (${sql.join(
            syllabusIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
        .orderBy(syllabusNodes.depth, syllabusNodes.sortOrder);

      // Get summaries for nodes that have them
      const summaries = await ctx.db
        .select({
          syllabusNodeId: topicNoteSummaries.syllabusNodeId,
          summaryText: topicNoteSummaries.summaryText,
          noteCount: topicNoteSummaries.noteCount,
        })
        .from(topicNoteSummaries)
        .where(
          sql`${topicNoteSummaries.syllabusId} IN (${sql.join(
            syllabusIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );

      const summaryMap = new Map(summaries.map((s) => [s.syllabusNodeId, s]));

      const topics = nodes.map((node) => {
        const summary = summaryMap.get(node.id);
        return {
          id: node.id,
          title: node.title,
          slug: node.slug ?? slugify(node.title),
          depth: node.depth,
          sortOrder: node.sortOrder,
          hasSummary: !!summary,
          summaryPreview: summary?.summaryText
            ? summary.summaryText.substring(0, 200) +
              (summary.summaryText.length > 200 ? "..." : "")
            : null,
          noteCount: summary?.noteCount ?? 0,
        };
      });

      return {
        exam: { id: exam.id, name: exam.name, slug: input.examSlug },
        topics,
      };
    }),

  // ─── Get Public Topic Summary ───
  // Returns truncated preview of topic summary for SEO pages
  getPublicTopicSummary: publicProcedure
    .input(
      z.object({
        examSlug: z.string().min(1).max(200),
        topicSlug: z.string().min(1).max(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Find the exam
      const allExams = await ctx.db
        .select({ id: exams.id, name: exams.name })
        .from(exams)
        .where(eq(exams.isActive, true));

      const exam = allExams.find((e) => slugify(e.name) === input.examSlug);
      if (!exam) return null;

      // Find the node by slug
      const examSyllabi = await ctx.db
        .select({ id: syllabi.id })
        .from(syllabi)
        .where(eq(syllabi.examId, exam.id));

      if (examSyllabi.length === 0) return null;

      const syllabusIds = examSyllabi.map((s) => s.id);

      const allNodes = await ctx.db
        .select({
          id: syllabusNodes.id,
          title: syllabusNodes.title,
          slug: syllabusNodes.slug,
          syllabusId: syllabusNodes.syllabusId,
        })
        .from(syllabusNodes)
        .where(
          sql`${syllabusNodes.syllabusId} IN (${sql.join(
            syllabusIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );

      const node = allNodes.find((n) => (n.slug ?? slugify(n.title)) === input.topicSlug);

      if (!node) return null;

      // Get summary
      const [summary] = await ctx.db
        .select({
          summaryText: topicNoteSummaries.summaryText,
          summaryHtml: topicNoteSummaries.summaryHtml,
          noteCount: topicNoteSummaries.noteCount,
        })
        .from(topicNoteSummaries)
        .where(eq(topicNoteSummaries.syllabusNodeId, node.id))
        .limit(1);

      // Get tutorial word count for CTA context
      const [tutorial] = await ctx.db
        .select({ wordCount: tutorialFiles.wordCount })
        .from(tutorialFiles)
        .where(and(eq(tutorialFiles.syllabusNodeId, node.id), eq(tutorialFiles.isCurrent, true)))
        .limit(1);

      return {
        examName: exam.name,
        examSlug: input.examSlug,
        topicTitle: node.title,
        topicSlug: input.topicSlug,
        summaryPreview: summary?.summaryText ? summary.summaryText.substring(0, 500) : null,
        noteCount: summary?.noteCount ?? 0,
        hasTutorial: !!tutorial,
        tutorialWordCount: tutorial?.wordCount ?? null,
      };
    }),

  // ─── List Public Exams ───
  // Returns exams that have syllabi with tutorials (for landing page + sitemap)
  listPublicExams: publicProcedure.query(async ({ ctx }) => {
    const examRows = await ctx.db
      .selectDistinctOn([exams.id], {
        id: exams.id,
        name: exams.name,
      })
      .from(exams)
      .innerJoin(syllabi, eq(syllabi.examId, exams.id))
      .innerJoin(tutorialFiles, eq(tutorialFiles.syllabusId, syllabi.id))
      .where(and(eq(exams.isActive, true), eq(tutorialFiles.isCurrent, true)))
      .orderBy(exams.id);

    // Get topic counts per exam
    const result = [];
    for (const exam of examRows) {
      const [countResult] = await ctx.db
        .select({ count: sql<number>`count(distinct ${tutorialFiles.syllabusNodeId})` })
        .from(tutorialFiles)
        .innerJoin(syllabi, eq(syllabi.id, tutorialFiles.syllabusId))
        .where(and(eq(syllabi.examId, exam.id), eq(tutorialFiles.isCurrent, true)));

      result.push({
        id: exam.id,
        name: exam.name,
        slug: slugify(exam.name),
        topicCount: Number(countResult?.count ?? 0),
      });
    }

    return result;
  }),
  // ─── Get Site Stats ───
  // Returns aggregate stats for the landing page (total users, questions, topics)
  getSiteStats: publicProcedure.query(async ({ ctx }) => {
    const [[userCount], [questionCount], [topicCount], [examCount]] = await Promise.all([
      ctx.db.select({ count: sql<number>`count(*)::int` }).from(users),
      ctx.db.select({ count: sql<number>`count(*)::int` }).from(questions),
      ctx.db
        .select({ count: sql<number>`count(distinct ${tutorialFiles.syllabusNodeId})::int` })
        .from(tutorialFiles)
        .where(eq(tutorialFiles.isCurrent, true)),
      ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(exams)
        .where(eq(exams.isActive, true)),
    ]);

    // Total visits approximation = sum of all user login counts
    const [visitResult] = await ctx.db
      .select({ total: sql<number>`coalesce(sum(login_count), 0)::int` })
      .from(users);

    return {
      totalUsers: userCount?.count ?? 0,
      totalQuestions: questionCount?.count ?? 0,
      totalTopics: topicCount?.count ?? 0,
      totalExams: examCount?.count ?? 0,
      totalVisits: visitResult?.total ?? 0,
    };
  }),

  // ─── Get Popular Keywords ───
  // Aggregates popular search terms from notes and conversations (public, no auth)
  getPopularKeywords: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const keywords = await ctx.db
        .select({
          keyword: sql<string>`keyword`,
          count: sql<number>`count(*)::int`,
        })
        .from(
          sql`(
            SELECT keyword FROM topic_notes WHERE keyword IS NOT NULL AND is_public = true
            UNION ALL
            SELECT keyword FROM topic_conversations WHERE keyword IS NOT NULL
          ) AS combined`,
        )
        .groupBy(sql`keyword`)
        .orderBy(sql`count(*) DESC`)
        .limit(input.limit);

      return keywords;
    }),
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
