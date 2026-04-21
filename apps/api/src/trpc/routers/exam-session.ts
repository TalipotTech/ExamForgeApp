import { z } from "zod";
import { eq, sql, and, inArray } from "drizzle-orm";
import { examSessions, questions, exams } from "@examforge/shared/db/schema";
import {
  examSessionStartSchema,
  examSessionSaveSchema,
  examSessionSubmitSchema,
} from "@examforge/shared/validators";
import { router, protectedProcedure } from "../trpc.js";

type QuestionForExam = {
  id: string;
  type: string;
  content: Record<string, unknown>;
  subject: string;
  topic: string | null;
  // Trust metadata (Question Acquisition Strategy §1.2)
  sourceType: string | null;
  sourceDetail: Record<string, unknown> | null;
  answerSource: string | null;
  verificationStatus: string | null;
  paperYear: number | null;
  originalExam: string | null;
  source: string | null;
};

type QuestionWithAnswer = QuestionForExam & {
  correctAnswer: unknown;
  explanation: string;
};

function stripAnswers(content: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...content };
  delete cleaned.answer;
  delete cleaned.explanation;
  return cleaned;
}

function calculateScore(
  questionRows: Array<{ id: string; content: Record<string, unknown> }>,
  userAnswers: Record<string, number>,
): { score: number; correct: number; total: number } {
  let correct = 0;
  const total = questionRows.length;

  for (const q of questionRows) {
    const content = q.content as { answer: number };
    const userAnswer = userAnswers[q.id];
    if (userAnswer !== undefined && userAnswer === content.answer) {
      correct++;
    }
  }

  return {
    score: total > 0 ? (correct / total) * 100 : 0,
    correct,
    total,
  };
}

export const examSessionRouter = router({
  start: protectedProcedure
    .input(examSessionStartSchema)
    .mutation(async ({ ctx, input }): Promise<{ sessionId: string }> => {
      const { examId, totalQuestions, durationMinutes, sourceTypes } = input;

      const [exam] = await ctx.db
        .select({ id: exams.id, name: exams.name })
        .from(exams)
        .where(and(eq(exams.id, examId), eq(exams.isActive, true)))
        .limit(1);

      if (!exam) {
        throw new Error("Exam not found or inactive");
      }

      // Build the question-pool filter. If the admin / student picked
      // one or more source tiers ("Previous year questions", "Textbook",
      // …) we scope to questions.source_type IN (...). Otherwise the
      // pool stays wide open, matching the old behaviour.
      const whereConditions = [eq(questions.examId, examId)];
      if (sourceTypes && sourceTypes.length > 0) {
        whereConditions.push(inArray(questions.sourceType, sourceTypes));
      }

      const questionRows = await ctx.db
        .select({ id: questions.id })
        .from(questions)
        .where(and(...whereConditions))
        .orderBy(sql`random()`)
        .limit(totalQuestions);

      if (questionRows.length === 0) {
        throw new Error("No questions available for this exam");
      }

      const questionIds = questionRows.map((q) => q.id);
      const duration = durationMinutes ?? Math.ceil(questionIds.length * 1.5);

      const [session] = await ctx.db
        .insert(examSessions)
        .values({
          userId: ctx.userId,
          examId,
          questions: questionIds,
          answers: {},
          totalQuestions: questionIds.length,
          orgId: ctx.orgId,
          metadata: { durationMinutes: duration, examName: exam.name },
        })
        .returning({ id: examSessions.id });

      if (!session) {
        throw new Error("Failed to create exam session");
      }
      return { sessionId: session.id };
    }),

  getSession: protectedProcedure.input(z.object({ sessionId: z.string().uuid() })).query(
    async ({
      ctx,
      input,
    }): Promise<{
      id: string;
      examId: string;
      examName: string;
      questions: QuestionForExam[];
      answers: Record<string, number>;
      totalQuestions: number;
      durationMinutes: number;
      startedAt: string;
      completedAt: string | null;
    }> => {
      const [session] = await ctx.db
        .select()
        .from(examSessions)
        .where(and(eq(examSessions.id, input.sessionId), eq(examSessions.userId, ctx.userId)))
        .limit(1);

      if (!session) {
        throw new Error("Session not found");
      }

      const questionIds = session.questions as string[];
      const questionRows = await ctx.db
        .select({
          id: questions.id,
          type: questions.type,
          content: questions.content,
          subject: questions.subject,
          topic: questions.topic,
          sourceType: questions.sourceType,
          sourceDetail: questions.sourceDetail,
          answerSource: questions.answerSource,
          verificationStatus: questions.verificationStatus,
          paperYear: questions.paperYear,
          originalExam: questions.originalExam,
          source: questions.source,
        })
        .from(questions)
        .where(inArray(questions.id, questionIds));

      const orderedQuestions: QuestionForExam[] = questionIds
        .map((qId) => questionRows.find((q) => q.id === qId))
        .filter((q): q is (typeof questionRows)[number] => q !== undefined)
        .map((q) => ({
          ...q,
          content: stripAnswers(q.content as Record<string, unknown>),
        }));

      const metadata = (session.metadata as Record<string, unknown>) ?? {};

      return {
        id: session.id,
        examId: session.examId,
        examName: (metadata.examName as string) ?? "Exam",
        questions: orderedQuestions,
        answers: (session.answers as Record<string, number>) ?? {},
        totalQuestions: session.totalQuestions,
        durationMinutes:
          (metadata.durationMinutes as number) ?? Math.ceil(session.totalQuestions * 1.5),
        startedAt: session.startedAt.toISOString(),
        completedAt: session.completedAt?.toISOString() ?? null,
      };
    },
  ),

  saveAnswers: protectedProcedure
    .input(examSessionSaveSchema)
    .mutation(async ({ ctx, input }): Promise<{ success: true }> => {
      const [session] = await ctx.db
        .select({ id: examSessions.id, completedAt: examSessions.completedAt })
        .from(examSessions)
        .where(and(eq(examSessions.id, input.sessionId), eq(examSessions.userId, ctx.userId)))
        .limit(1);

      if (!session) throw new Error("Session not found");
      if (session.completedAt) throw new Error("Session already completed");

      await ctx.db
        .update(examSessions)
        .set({
          answers: input.answers,
          updatedAt: new Date(),
        })
        .where(eq(examSessions.id, input.sessionId));

      return { success: true };
    }),

  submit: protectedProcedure
    .input(examSessionSubmitSchema)
    .mutation(
      async ({ ctx, input }): Promise<{ score: number; correct: number; total: number }> => {
        const [session] = await ctx.db
          .select()
          .from(examSessions)
          .where(and(eq(examSessions.id, input.sessionId), eq(examSessions.userId, ctx.userId)))
          .limit(1);

        if (!session) throw new Error("Session not found");
        if (session.completedAt) throw new Error("Session already submitted");

        const questionIds = session.questions as string[];
        const questionRows = await ctx.db
          .select({ id: questions.id, content: questions.content })
          .from(questions)
          .where(inArray(questions.id, questionIds));

        const { score, correct, total } = calculateScore(
          questionRows as Array<{ id: string; content: Record<string, unknown> }>,
          input.answers,
        );

        const timeTakenSeconds = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);

        await ctx.db
          .update(examSessions)
          .set({
            answers: input.answers,
            score,
            timeTakenSeconds,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(examSessions.id, input.sessionId));

        return { score, correct, total };
      },
    ),

  getResults: protectedProcedure.input(z.object({ sessionId: z.string().uuid() })).query(
    async ({
      ctx,
      input,
    }): Promise<{
      id: string;
      examId: string;
      examName: string;
      score: number;
      correct: number;
      incorrect: number;
      unanswered: number;
      totalQuestions: number;
      timeTakenSeconds: number;
      questions: QuestionWithAnswer[];
      userAnswers: Record<string, number>;
    }> => {
      const [session] = await ctx.db
        .select()
        .from(examSessions)
        .where(and(eq(examSessions.id, input.sessionId), eq(examSessions.userId, ctx.userId)))
        .limit(1);

      if (!session) throw new Error("Session not found");
      if (!session.completedAt) throw new Error("Session not yet completed");

      const questionIds = session.questions as string[];
      const userAnswers = (session.answers as Record<string, number>) ?? {};

      const questionRows = await ctx.db
        .select({
          id: questions.id,
          type: questions.type,
          content: questions.content,
          subject: questions.subject,
          topic: questions.topic,
          sourceType: questions.sourceType,
          sourceDetail: questions.sourceDetail,
          answerSource: questions.answerSource,
          verificationStatus: questions.verificationStatus,
          paperYear: questions.paperYear,
          originalExam: questions.originalExam,
          source: questions.source,
        })
        .from(questions)
        .where(inArray(questions.id, questionIds));

      const orderedQuestions: QuestionWithAnswer[] = questionIds
        .map((qId) => questionRows.find((q) => q.id === qId))
        .filter((q): q is (typeof questionRows)[number] => q !== undefined)
        .map((q) => {
          const content = q.content as Record<string, unknown>;
          return {
            id: q.id,
            type: q.type,
            content,
            subject: q.subject,
            topic: q.topic,
            sourceType: q.sourceType,
            sourceDetail: q.sourceDetail,
            answerSource: q.answerSource,
            verificationStatus: q.verificationStatus,
            paperYear: q.paperYear,
            originalExam: q.originalExam,
            source: q.source,
            correctAnswer: content.answer,
            explanation: (content.explanation as string) ?? "",
          };
        });

      let correct = 0;
      let incorrect = 0;
      let unanswered = 0;

      for (const q of orderedQuestions) {
        const ua = userAnswers[q.id];
        if (ua === undefined) {
          unanswered++;
        } else if (ua === q.correctAnswer) {
          correct++;
        } else {
          incorrect++;
        }
      }

      const metadata = (session.metadata as Record<string, unknown>) ?? {};

      return {
        id: session.id,
        examId: session.examId,
        examName: (metadata.examName as string) ?? "Exam",
        score: session.score ?? 0,
        correct,
        incorrect,
        unanswered,
        totalQuestions: session.totalQuestions,
        timeTakenSeconds: session.timeTakenSeconds ?? 0,
        questions: orderedQuestions,
        userAnswers,
      };
    },
  ),
});
