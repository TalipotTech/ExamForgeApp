import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  examPatterns,
  paperAnalysis,
  questions,
  exams,
  portalDocuments,
  userGeneratedExams,
} from "@examforge/shared/db/schema";
import type { ExamFingerprint } from "@examforge/shared/db/schema";
import {
  classifyPaperInputSchema,
  analyzePatternInputSchema,
  getPatternInputSchema,
  getPaperAnalysisInputSchema,
  generatePatternExamInputSchema,
  getTopicPredictionsInputSchema,
  getRepeatCandidatesInputSchema,
  getClassificationStatusInputSchema,
  patternGeneratedExamSchema,
} from "@examforge/shared/validators";
import { router, protectedProcedure, adminProcedure } from "../trpc.js";
import { addClassifyPaperJob, addAnalyzePatternJob } from "../../queues/pattern-analysis-queue.js";
import { routeAIRequest } from "../../ai/ai-router.js";
import { buildPatternGenerationPrompt } from "../../ai/prompts/pattern-generation.js";

export const examPatternRouter = router({
  // ─── Admin: Classify a single paper ───
  classifyPaper: adminProcedure.input(classifyPaperInputSchema).mutation(async ({ input, ctx }) => {
    const jobId = await addClassifyPaperJob({
      examId: input.examId,
      portalDocumentId: input.portalDocumentId,
      paperYear: input.paperYear,
      userId: ctx.userId,
      orgId: ctx.orgId ?? "",
    });
    return { success: true, jobId };
  }),

  // ─── Admin: Classify all papers and run pattern analysis ───
  analyzeExistingPapers: adminProcedure
    .input(analyzePatternInputSchema)
    .mutation(async ({ input, ctx }) => {
      // Find all portal documents for this exam with extracted questions
      const docs = await ctx.db
        .select({ id: portalDocuments.id, examYear: portalDocuments.examYear })
        .from(portalDocuments)
        .where(
          and(
            eq(portalDocuments.examId, input.examId),
            sql`${portalDocuments.questionsExtracted} > 0`,
          ),
        );

      // Also find distinct paperYears from questions without portal documents
      const directQuestions = await ctx.db
        .select({ paperYear: questions.paperYear })
        .from(questions)
        .where(
          and(
            eq(questions.examId, input.examId),
            sql`${questions.paperYear} IS NOT NULL`,
            sql`${questions.portalDocumentId} IS NULL`,
          ),
        )
        .groupBy(questions.paperYear);

      const classifyJobIds: string[] = [];

      // Queue classification for each portal document
      for (const doc of docs) {
        // Skip if already classified (unless force reanalyze)
        if (!input.forceReanalyze) {
          const existing = await ctx.db
            .select({ id: paperAnalysis.id })
            .from(paperAnalysis)
            .where(
              and(
                eq(paperAnalysis.portalDocumentId, doc.id),
                eq(paperAnalysis.status, "classified"),
              ),
            )
            .limit(1);
          if (existing.length > 0) continue;
        }

        const jobId = await addClassifyPaperJob({
          examId: input.examId,
          portalDocumentId: doc.id,
          userId: ctx.userId,
          orgId: ctx.orgId ?? "",
        });
        classifyJobIds.push(jobId);
      }

      // Queue classification for questions without portal documents
      for (const row of directQuestions) {
        if (!row.paperYear) continue;

        if (!input.forceReanalyze) {
          const existing = await ctx.db
            .select({ id: paperAnalysis.id })
            .from(paperAnalysis)
            .where(
              and(
                eq(paperAnalysis.examId, input.examId),
                eq(paperAnalysis.year, row.paperYear),
                sql`${paperAnalysis.portalDocumentId} IS NULL`,
                eq(paperAnalysis.status, "classified"),
              ),
            )
            .limit(1);
          if (existing.length > 0) continue;
        }

        const jobId = await addClassifyPaperJob({
          examId: input.examId,
          paperYear: row.paperYear,
          userId: ctx.userId,
          orgId: ctx.orgId ?? "",
        });
        classifyJobIds.push(jobId);
      }

      // Queue the pattern analysis (will run after classifications complete)
      const analyzeJobId = await addAnalyzePatternJob({
        examId: input.examId,
        userId: ctx.userId,
        orgId: ctx.orgId ?? "",
      });

      return {
        success: true,
        classifyJobIds,
        analyzeJobId,
        papersToClassify: classifyJobIds.length,
      };
    }),

  // ─── Get current pattern for an exam ───
  getPattern: protectedProcedure.input(getPatternInputSchema).query(async ({ input, ctx }) => {
    const [pattern] = await ctx.db
      .select()
      .from(examPatterns)
      .where(and(eq(examPatterns.examId, input.examId), eq(examPatterns.isCurrent, true)))
      .limit(1);

    return pattern ?? null;
  }),

  // ─── Get all paper analyses for an exam ───
  getPaperAnalysis: protectedProcedure
    .input(getPaperAnalysisInputSchema)
    .query(async ({ input, ctx }) => {
      const papers = await ctx.db
        .select()
        .from(paperAnalysis)
        .where(eq(paperAnalysis.examId, input.examId))
        .orderBy(desc(paperAnalysis.year));

      return papers;
    }),

  // ─── Get classification status ───
  getClassificationStatus: protectedProcedure
    .input(getClassificationStatusInputSchema)
    .query(async ({ input, ctx }) => {
      const allPapers = await ctx.db
        .select({
          id: paperAnalysis.id,
          status: paperAnalysis.status,
          year: paperAnalysis.year,
          totalQuestions: paperAnalysis.totalQuestions,
        })
        .from(paperAnalysis)
        .where(eq(paperAnalysis.examId, input.examId));

      const classified = allPapers.filter((p) => p.status === "classified");
      const classifying = allPapers.filter((p) => p.status === "classifying");
      const errors = allPapers.filter((p) => p.status === "error");

      // Count total questions classified
      const totalQuestionsResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(questions)
        .where(
          and(eq(questions.examId, input.examId), sql`${questions.analyzedSubject} IS NOT NULL`),
        );

      return {
        totalPapers: allPapers.length,
        classifiedPapers: classified.length,
        classifyingPapers: classifying.length,
        errorPapers: errors.length,
        totalQuestionsClassified: Number(totalQuestionsResult[0]?.count ?? 0),
        papers: allPapers,
      };
    }),

  // ─── Generate a pattern-matched exam ───
  generatePatternExam: protectedProcedure
    .input(generatePatternExamInputSchema)
    .mutation(async ({ input, ctx }) => {
      // Load the current pattern
      const [pattern] = await ctx.db
        .select()
        .from(examPatterns)
        .where(
          and(
            eq(examPatterns.examId, input.examId),
            eq(examPatterns.isCurrent, true),
            eq(examPatterns.status, "active"),
          ),
        )
        .limit(1);

      if (!pattern) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No active pattern analysis found for this exam. Run pattern analysis first.",
        });
      }

      const fingerprint = pattern.fingerprint as ExamFingerprint;

      // Build and execute the generation prompt
      const { systemPrompt, prompt } = buildPatternGenerationPrompt(fingerprint, {
        totalQuestions: input.questionCount,
        includeRepeats: input.includeRepeats,
        includeCurrentAffairs: input.includeCurrentAffairs,
        yearFocus: input.yearFocus,
      });

      const result = await routeAIRequest(
        {
          task: "generate_pattern_exam",
          prompt,
          systemPrompt,
          schema: patternGeneratedExamSchema,
          userId: ctx.userId,
          examId: input.examId,
          temperature: 0.7,
        },
        ctx.db,
      );

      // Get exam details
      const [exam] = await ctx.db.select().from(exams).where(eq(exams.id, input.examId)).limit(1);

      if (!exam) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Exam not found" });
      }

      // Save as user-generated exam
      const generatedQuestions = result.data.questions.map((q, idx) => ({
        question: q.question,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        subject: q.subject,
        difficulty: q.difficulty,
        questionNumber: idx + 1,
      }));

      const [userExam] = await ctx.db
        .insert(userGeneratedExams)
        .values({
          userId: ctx.userId,
          examId: input.examId,
          title: `${exam.name} — Pattern Exam`,
          questions: generatedQuestions,
          questionCount: generatedQuestions.length,
          ownerType: "user",
          ownerId: ctx.userId,
        })
        .returning({ id: userGeneratedExams.id });

      return {
        success: true,
        examId: userExam!.id,
        questionCount: generatedQuestions.length,
        patternVersion: pattern.version,
        papersAnalyzed: pattern.papersAnalyzed,
      };
    }),

  // ─── Topic predictions ───
  getTopicPredictions: protectedProcedure
    .input(getTopicPredictionsInputSchema)
    .query(async ({ input, ctx }) => {
      const [pattern] = await ctx.db
        .select()
        .from(examPatterns)
        .where(and(eq(examPatterns.examId, input.examId), eq(examPatterns.isCurrent, true)))
        .limit(1);

      if (!pattern) {
        return { predictions: [], papersAnalyzed: 0 };
      }

      const fingerprint = pattern.fingerprint as ExamFingerprint;

      // Sort topics by frequency and importance
      const predictions = fingerprint.topicFrequency
        .sort((a, b) => {
          // must_study > high > medium > low
          const importanceOrder = { must_study: 4, high: 3, medium: 2, low: 1 };
          const importanceDiff =
            (importanceOrder[b.importance] ?? 0) - (importanceOrder[a.importance] ?? 0);
          if (importanceDiff !== 0) return importanceDiff;
          return b.appearsInPercent - a.appearsInPercent;
        })
        .slice(0, input.topN)
        .map((t) => ({
          subject: t.subject,
          topic: t.topic,
          appearsInPercent: t.appearsInPercent,
          avgQuestionsPerPaper: t.avgQuestionsPerPaper,
          importance: t.importance,
        }));

      return {
        predictions,
        papersAnalyzed: pattern.papersAnalyzed,
        confidence: pattern.confidence,
      };
    }),

  // ─── Repeat candidates ───
  getRepeatCandidates: protectedProcedure
    .input(getRepeatCandidatesInputSchema)
    .query(async ({ input, ctx }) => {
      const repeatedQuestions = await ctx.db
        .select({
          id: questions.id,
          content: questions.content,
          subject: questions.subject,
          topic: questions.topic,
          analyzedSubject: questions.analyzedSubject,
          analyzedTopic: questions.analyzedTopic,
          paperYear: questions.paperYear,
          paperNumber: questions.paperNumber,
          questionNumber: questions.questionNumber,
          repeatedFrom: questions.repeatedFrom,
          patternTags: questions.patternTags,
        })
        .from(questions)
        .where(and(eq(questions.examId, input.examId), eq(questions.isRepeated, true)))
        .orderBy(desc(questions.paperYear))
        .limit(input.limit);

      // Group by topic
      const topicGroups: Record<
        string,
        {
          topic: string;
          subject: string;
          questions: typeof repeatedQuestions;
          repeatCount: number;
        }
      > = {};

      for (const q of repeatedQuestions) {
        const topicKey = q.analyzedTopic ?? q.topic ?? "Unknown";
        const subjectKey = q.analyzedSubject ?? q.subject;

        if (!topicGroups[topicKey]) {
          topicGroups[topicKey] = {
            topic: topicKey,
            subject: subjectKey,
            questions: [],
            repeatCount: 0,
          };
        }
        topicGroups[topicKey]!.questions.push(q);
        topicGroups[topicKey]!.repeatCount++;
      }

      const grouped = Object.values(topicGroups).sort((a, b) => b.repeatCount - a.repeatCount);

      return {
        candidates: grouped,
        totalRepeated: repeatedQuestions.length,
      };
    }),
});
