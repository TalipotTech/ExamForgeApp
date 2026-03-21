import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  voiceSessions,
  examSessions,
  questions,
  exams,
  userProgress,
} from "@examforge/shared/db/schema";
import type { VoiceSessionQuestion, VoiceConversationEntry } from "@examforge/shared/db/schema";
import {
  startVoiceSessionSchema,
  submitVoiceAnswerSchema,
  teacherRespondSchema,
  completeVoiceSessionSchema,
  listVoiceSessionsSchema,
  getVoiceSessionSchema,
  teacherResponseSchema,
} from "@examforge/shared/validators";
import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { routeAIRequest } from "../../ai/ai-router.js";
import { getFlag } from "../../services/feature-flags.js";
import { getTTSProvider } from "../../services/tts/tts-factory.js";
import { logTTSUsage, canUserSynthesize } from "../../services/tts/tts-usage.js";
import {
  VOICE_TEACHER_SYSTEM_PROMPT,
  buildVoiceTeacherPrompt,
} from "../../ai/prompts/voice-teacher.js";

export const voiceTutorRouter = router({
  startSession: protectedProcedure
    .input(startVoiceSessionSchema)
    .mutation(
      async ({ ctx, input }): Promise<{ sessionId: string; questions: VoiceSessionQuestion[] }> => {
        const { mode, examId, sourceSessionId, questionCount, difficulty } = input;

        // Verify exam exists
        const [exam] = await ctx.db
          .select({ id: exams.id, name: exams.name })
          .from(exams)
          .where(eq(exams.id, examId))
          .limit(1);

        if (!exam) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Exam not found" });
        }

        let sessionQuestions: VoiceSessionQuestion[] = [];

        if (mode === "recap" && sourceSessionId) {
          // Load questions from completed exam session
          const [sourceSession] = await ctx.db
            .select()
            .from(examSessions)
            .where(and(eq(examSessions.id, sourceSessionId), eq(examSessions.userId, ctx.userId)))
            .limit(1);

          if (!sourceSession) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Source exam session not found",
            });
          }

          const questionIds = sourceSession.questions as string[];
          const questionRows = await ctx.db
            .select({
              id: questions.id,
              content: questions.content,
              subject: questions.subject,
            })
            .from(questions)
            .where(inArray(questions.id, questionIds));

          sessionQuestions = questionIds
            .map((qId) => questionRows.find((q) => q.id === qId))
            .filter((q): q is (typeof questionRows)[number] => q !== undefined)
            .map((q) => {
              const content = q.content as Record<string, unknown>;
              const mcq = content as {
                question: string;
                options: string[];
                answer: number;
                explanation?: string;
              };
              return {
                questionId: q.id,
                question: mcq.question,
                options: mcq.options,
                correctAnswer: mcq.answer,
                explanation: mcq.explanation ?? "",
                subject: q.subject,
              };
            });
        } else if (mode === "fresh_exam" || mode === "recap") {
          // Pull questions from the question bank
          const difficultyFilter =
            difficulty && difficulty !== "mixed"
              ? sql`AND ${questions.difficulty} = ${difficulty}`
              : sql``;

          const subjectFilter = input.subject
            ? sql`AND ${questions.subject} = ${input.subject}`
            : sql``;

          const questionRows = await ctx.db
            .select({
              id: questions.id,
              content: questions.content,
              subject: questions.subject,
            })
            .from(questions)
            .where(sql`${questions.examId} = ${examId} ${difficultyFilter} ${subjectFilter}`)
            .orderBy(sql`random()`)
            .limit(questionCount);

          sessionQuestions = questionRows.map((q) => {
            const content = q.content as Record<string, unknown>;
            const mcq = content as {
              question: string;
              options: string[];
              answer: number;
              explanation?: string;
            };
            return {
              questionId: q.id,
              question: mcq.question,
              options: mcq.options,
              correctAnswer: mcq.answer,
              explanation: mcq.explanation ?? "",
              subject: q.subject,
            };
          });
        } else if (mode === "teacher") {
          // For teacher mode, we start with a smaller set of questions
          // AI will generate follow-ups dynamically
          const questionRows = await ctx.db
            .select({
              id: questions.id,
              content: questions.content,
              subject: questions.subject,
            })
            .from(questions)
            .where(eq(questions.examId, examId))
            .orderBy(sql`random()`)
            .limit(5);

          sessionQuestions = questionRows.map((q) => {
            const content = q.content as Record<string, unknown>;
            const mcq = content as {
              question: string;
              options: string[];
              answer: number;
              explanation?: string;
            };
            return {
              questionId: q.id,
              question: mcq.question,
              options: mcq.options,
              correctAnswer: mcq.answer,
              explanation: mcq.explanation ?? "",
              subject: q.subject,
            };
          });
        }

        if (sessionQuestions.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No questions available for this configuration",
          });
        }

        // Create voice session record
        const [session] = await ctx.db
          .insert(voiceSessions)
          .values({
            userId: ctx.userId,
            examId,
            mode,
            sourceSessionId: sourceSessionId ?? null,
            sourceUserExamId: input.sourceUserExamId ?? null,
            subject: input.subject ?? null,
            topic: input.topic ?? null,
            questionCount: sessionQuestions.length,
            difficulty: difficulty ?? "mixed",
            questions: sessionQuestions,
            totalQuestions: sessionQuestions.length,
            status: "active",
          })
          .returning({ id: voiceSessions.id });

        if (!session) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create voice session",
          });
        }

        return { sessionId: session.id, questions: sessionQuestions };
      },
    ),

  submitAnswer: protectedProcedure.input(submitVoiceAnswerSchema).mutation(
    async ({
      ctx,
      input,
    }): Promise<{
      isCorrect: boolean;
      correctIndex: number;
      explanation: string;
    }> => {
      const [session] = await ctx.db
        .select()
        .from(voiceSessions)
        .where(and(eq(voiceSessions.id, input.sessionId), eq(voiceSessions.userId, ctx.userId)))
        .limit(1);

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Voice session not found",
        });
      }

      const currentQuestions = (session.questions as VoiceSessionQuestion[]) ?? [];
      const question = currentQuestions[input.questionIndex];

      if (!question) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid question index",
        });
      }

      const isCorrect = input.selectedIndex === question.correctAnswer;

      // Update the question with the user's answer
      currentQuestions[input.questionIndex] = {
        ...question,
        userAnswer: input.selectedIndex,
        isCorrect,
        answeredAt: new Date().toISOString(),
        spokenTranscript: input.spokenTranscript,
        responseTimeMs: input.responseTimeMs,
      };

      const answeredCount = currentQuestions.filter((q) => q.userAnswer !== undefined).length;
      const correctCount = currentQuestions.filter((q) => q.isCorrect === true).length;

      await ctx.db
        .update(voiceSessions)
        .set({
          questions: currentQuestions,
          answeredCount,
          correctCount,
          updatedAt: new Date(),
        })
        .where(eq(voiceSessions.id, input.sessionId));

      return {
        isCorrect,
        correctIndex: question.correctAnswer,
        explanation: question.explanation ?? "",
      };
    },
  ),

  teacherRespond: protectedProcedure.input(teacherRespondSchema).mutation(
    async ({
      ctx,
      input,
    }): Promise<{
      tutorResponse: string;
      nextQuestion: {
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
        difficulty: string;
        subject: string;
      } | null;
      shouldAskQuestion: boolean;
      adaptedDifficulty: string;
    }> => {
      const [session] = await ctx.db
        .select()
        .from(voiceSessions)
        .where(and(eq(voiceSessions.id, input.sessionId), eq(voiceSessions.userId, ctx.userId)))
        .limit(1);

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Voice session not found",
        });
      }

      // Get exam name
      const [exam] = await ctx.db
        .select({ name: exams.name })
        .from(exams)
        .where(eq(exams.id, session.examId))
        .limit(1);

      // Get user's weak areas
      const [progress] = await ctx.db
        .select({ weakSubjects: userProgress.weakSubjects })
        .from(userProgress)
        .where(and(eq(userProgress.userId, ctx.userId), eq(userProgress.examId, session.examId)))
        .limit(1);

      const conversation = (session.conversation as VoiceConversationEntry[]) ?? [];

      // Build conversation history string
      const historyStr = conversation
        .slice(-10)
        .map((c) => `${c.role === "tutor" ? "Tutor" : "Student"}: ${c.text}`)
        .join("\n");

      // Calculate recent performance
      const sessionQuestions = (session.questions as VoiceSessionQuestion[]) ?? [];
      const answered = sessionQuestions.filter((q) => q.userAnswer !== undefined);
      const recentPerformance =
        answered.length > 0
          ? `${answered.filter((q) => q.isCorrect).length}/${answered.length} correct in this session`
          : "No answers yet in this session";

      const prompt = buildVoiceTeacherPrompt({
        examName: exam?.name ?? "Exam",
        topic: session.topic ?? session.subject ?? "General",
        recentPerformance,
        weakAreas: (progress?.weakSubjects as string[]) ?? [],
        conversationHistory: historyStr,
        userMessage: input.userMessage,
        currentQuestionContext: input.currentQuestionContext,
      });

      const result = await routeAIRequest(
        {
          task: "voice_teacher",
          prompt,
          systemPrompt: VOICE_TEACHER_SYSTEM_PROMPT,
          schema: teacherResponseSchema,
          userId: ctx.userId,
          examId: session.examId,
          temperature: 0.7,
          skipCache: true,
        },
        ctx.db,
      );

      // Update conversation history
      const updatedConversation: VoiceConversationEntry[] = [
        ...conversation,
        {
          role: "user" as const,
          text: input.userMessage,
          timestamp: new Date().toISOString(),
          questionContext: input.currentQuestionContext,
        },
        {
          role: "tutor" as const,
          text: result.data.tutorResponse,
          timestamp: new Date().toISOString(),
        },
      ];

      await ctx.db
        .update(voiceSessions)
        .set({
          conversation: updatedConversation,
          aiTokensUsed: (session.aiTokensUsed ?? 0) + result.usage.totalTokens,
          aiCostUsd: (session.aiCostUsd ?? 0) + result.estimatedCostUsd,
          updatedAt: new Date(),
        })
        .where(eq(voiceSessions.id, input.sessionId));

      return result.data;
    },
  ),

  completeSession: protectedProcedure.input(completeVoiceSessionSchema).mutation(
    async ({
      ctx,
      input,
    }): Promise<{
      score: number;
      totalQuestions: number;
      correctCount: number;
      weakAreas: string[];
    }> => {
      const [session] = await ctx.db
        .select()
        .from(voiceSessions)
        .where(and(eq(voiceSessions.id, input.sessionId), eq(voiceSessions.userId, ctx.userId)))
        .limit(1);

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Voice session not found",
        });
      }

      const sessionQuestions = (session.questions as VoiceSessionQuestion[]) ?? [];
      const answered = sessionQuestions.filter((q) => q.userAnswer !== undefined);
      const correctCount = answered.filter((q) => q.isCorrect).length;
      const scorePercent = answered.length > 0 ? (correctCount / answered.length) * 100 : 0;
      const skippedCount = sessionQuestions.length - answered.length;

      // Calculate weak areas by subject
      const subjectResults: Record<string, { correct: number; total: number }> = {};
      for (const q of sessionQuestions) {
        const subj = q.subject ?? "General";
        if (!subjectResults[subj]) subjectResults[subj] = { correct: 0, total: 0 };
        subjectResults[subj].total++;
        if (q.isCorrect) subjectResults[subj].correct++;
      }

      const weakAreas = Object.entries(subjectResults)
        .filter(([, stats]) => stats.total > 0 && stats.correct / stats.total < 0.5)
        .map(([subject]) => subject);

      await ctx.db
        .update(voiceSessions)
        .set({
          status: "completed",
          answeredCount: answered.length,
          correctCount,
          skippedCount,
          scorePercent,
          durationSeconds: input.durationSeconds,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(voiceSessions.id, input.sessionId));

      // Update user progress
      const [existingProgress] = await ctx.db
        .select()
        .from(userProgress)
        .where(and(eq(userProgress.userId, ctx.userId), eq(userProgress.examId, session.examId)))
        .limit(1);

      if (existingProgress) {
        const newTotalAttempted = existingProgress.totalQuestionsAttempted + answered.length;
        const newTotalCorrect = existingProgress.totalCorrect + correctCount;
        const newTotalExams = existingProgress.totalExamsTaken + 1;

        await ctx.db
          .update(userProgress)
          .set({
            totalQuestionsAttempted: newTotalAttempted,
            totalCorrect: newTotalCorrect,
            totalExamsTaken: newTotalExams,
            averageScore: newTotalAttempted > 0 ? (newTotalCorrect / newTotalAttempted) * 100 : 0,
            lastActivityAt: new Date(),
            weakSubjects: weakAreas.length > 0 ? weakAreas : existingProgress.weakSubjects,
            updatedAt: new Date(),
          })
          .where(eq(userProgress.id, existingProgress.id));
      }

      return {
        score: scorePercent,
        totalQuestions: sessionQuestions.length,
        correctCount,
        weakAreas,
      };
    },
  ),

  listSessions: protectedProcedure.input(listVoiceSessionsSchema).query(
    async ({
      ctx,
      input,
    }): Promise<
      Array<{
        id: string;
        mode: string;
        examId: string;
        status: string;
        totalQuestions: number | null;
        correctCount: number | null;
        scorePercent: number | null;
        durationSeconds: number | null;
        startedAt: string;
        completedAt: string | null;
      }>
    > => {
      const conditions = [eq(voiceSessions.userId, ctx.userId)];

      if (input.examId) {
        conditions.push(eq(voiceSessions.examId, input.examId));
      }
      if (input.mode) {
        conditions.push(eq(voiceSessions.mode, input.mode));
      }

      const sessions = await ctx.db
        .select({
          id: voiceSessions.id,
          mode: voiceSessions.mode,
          examId: voiceSessions.examId,
          status: voiceSessions.status,
          totalQuestions: voiceSessions.totalQuestions,
          correctCount: voiceSessions.correctCount,
          scorePercent: voiceSessions.scorePercent,
          durationSeconds: voiceSessions.durationSeconds,
          startedAt: voiceSessions.startedAt,
          completedAt: voiceSessions.completedAt,
        })
        .from(voiceSessions)
        .where(and(...conditions))
        .orderBy(desc(voiceSessions.startedAt))
        .limit(input.limit);

      return sessions.map((s) => ({
        ...s,
        startedAt: s.startedAt.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
      }));
    },
  ),

  getSession: protectedProcedure.input(getVoiceSessionSchema).query(
    async ({
      ctx,
      input,
    }): Promise<{
      id: string;
      mode: string;
      examId: string;
      status: string;
      subject: string | null;
      topic: string | null;
      questions: VoiceSessionQuestion[];
      totalQuestions: number | null;
      answeredCount: number | null;
      correctCount: number | null;
      skippedCount: number | null;
      scorePercent: number | null;
      durationSeconds: number | null;
      conversation: VoiceConversationEntry[];
      startedAt: string;
      completedAt: string | null;
    }> => {
      const [session] = await ctx.db
        .select()
        .from(voiceSessions)
        .where(and(eq(voiceSessions.id, input.id), eq(voiceSessions.userId, ctx.userId)))
        .limit(1);

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Voice session not found",
        });
      }

      return {
        id: session.id,
        mode: session.mode,
        examId: session.examId,
        status: session.status,
        subject: session.subject,
        topic: session.topic,
        questions: (session.questions as VoiceSessionQuestion[]) ?? [],
        totalQuestions: session.totalQuestions,
        answeredCount: session.answeredCount,
        correctCount: session.correctCount,
        skippedCount: session.skippedCount,
        scorePercent: session.scorePercent,
        durationSeconds: session.durationSeconds,
        conversation: (session.conversation as VoiceConversationEntry[]) ?? [],
        startedAt: session.startedAt.toISOString(),
        completedAt: session.completedAt?.toISOString() ?? null,
      };
    },
  ),

  // ─── Premium TTS ───

  synthesize: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1).max(5000),
        voiceId: z.string().min(1),
        rate: z.number().min(0.5).max(2.0).optional(),
        sessionId: z.string().uuid().optional(),
      }),
    )
    .mutation(
      async ({
        ctx,
        input,
      }): Promise<{ audioBase64: string; contentType: string; charCount: number }> => {
        const enabled = await getFlag(ctx.db, "voice.premium_tts_enabled");
        if (!enabled) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Premium TTS is not enabled. Contact admin.",
          });
        }

        const quota = await canUserSynthesize(ctx.db, ctx.userId, input.text.length);
        if (!quota.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Monthly TTS limit reached (${quota.used}/${quota.limit} chars). Resets next month.`,
          });
        }

        const provider = await getTTSProvider("azure", ctx.db);
        const result = await provider.synthesize({
          text: input.text,
          voiceId: input.voiceId,
          rate: input.rate,
        });

        // Azure free tier: ~$0 for first 500K, then ~$16/1M chars
        const estimatedCost = result.charCount * 0.000016;

        await logTTSUsage(ctx.db, {
          userId: ctx.userId,
          provider: "azure",
          voiceId: input.voiceId,
          charCount: result.charCount,
          estimatedCostUsd: estimatedCost,
          sessionId: input.sessionId,
        });

        return {
          audioBase64: result.audioBase64,
          contentType: result.contentType,
          charCount: result.charCount,
        };
      },
    ),

  getAvailableVoices: protectedProcedure.query(
    async ({
      ctx,
    }): Promise<{
      premiumEnabled: boolean;
      premiumVoices: Array<{
        id: string;
        name: string;
        gender: string;
        locale: string;
        provider: string;
      }>;
      userUsage: { used: number; limit: number; remaining: number };
    }> => {
      const enabled = (await getFlag(ctx.db, "voice.premium_tts_enabled")) as boolean;

      if (!enabled) {
        return {
          premiumEnabled: false,
          premiumVoices: [],
          userUsage: { used: 0, limit: 0, remaining: 0 },
        };
      }

      const provider = await getTTSProvider("azure", ctx.db).catch(() => null);
      const voices = provider?.listVoices() ?? [];
      const quota = await canUserSynthesize(ctx.db, ctx.userId, 0);

      return {
        premiumEnabled: true,
        premiumVoices: voices,
        userUsage: { used: quota.used, limit: quota.limit, remaining: quota.remaining },
      };
    },
  ),

  getTTSUsage: protectedProcedure.query(
    async ({ ctx }): Promise<{ used: number; limit: number; remaining: number }> => {
      const quota = await canUserSynthesize(ctx.db, ctx.userId, 0);
      return { used: quota.used, limit: quota.limit, remaining: quota.remaining };
    },
  ),
});
