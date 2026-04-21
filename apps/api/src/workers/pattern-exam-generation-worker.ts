/**
 * Pattern Exam Generation Worker
 *
 * Runs the AI generation originally embedded in the
 * examPattern.generatePatternExam tRPC mutation. Split out so the
 * mutation can return instantly with a job id instead of blocking
 * 30-90 seconds on the Anthropic/OpenAI call — that was tripping the
 * Next.js dev proxy's 30-second timeout with ECONNRESET.
 *
 * Pipeline:
 *   1. Load the exam's active pattern (fingerprint + paper count).
 *   2. Call the pattern-generation prompt for `questionCount` MCQs.
 *   3. Insert a user_generated_exam row with the output.
 *   4. Return the new user-exam id so the UI can navigate to it.
 */

import { Worker, Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import { examPatterns, exams, userGeneratedExams } from "@examforge/shared/db/schema";
import type { ExamFingerprint } from "@examforge/shared/db/schema";
import { patternGeneratedExamSchema } from "@examforge/shared/validators";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import {
  PATTERN_EXAM_GENERATION_QUEUE_NAME,
  type PatternExamGenerationJobData,
  type PatternExamGenerationJobResult,
} from "../queues/pattern-exam-generation-queue.js";
import { routeAIRequest } from "../ai/ai-router.js";
import { buildPatternGenerationPrompt } from "../ai/prompts/pattern-generation.js";

export function createPatternExamGenerationWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    PATTERN_EXAM_GENERATION_QUEUE_NAME,
    async (job: Job): Promise<PatternExamGenerationJobResult> => {
      const data = job.data as PatternExamGenerationJobData;
      console.log(
        `[pattern-exam-gen] Starting job ${job.id} for exam=${data.examId} count=${data.questionCount}`,
      );

      // 1. Load active pattern.
      await job.updateProgress({ stage: "loading-pattern", percent: 10 });
      const [pattern] = await db
        .select()
        .from(examPatterns)
        .where(
          and(
            eq(examPatterns.examId, data.examId),
            eq(examPatterns.isCurrent, true),
            eq(examPatterns.status, "active"),
          ),
        )
        .limit(1);

      if (!pattern) {
        throw new Error(
          "No active pattern analysis found for this exam. Run pattern analysis first.",
        );
      }

      const fingerprint = pattern.fingerprint as ExamFingerprint;

      // 2. AI generation call.
      await job.updateProgress({ stage: "generating", percent: 30 });
      const { systemPrompt, prompt } = buildPatternGenerationPrompt(fingerprint, {
        totalQuestions: data.questionCount,
        includeRepeats: data.includeRepeats,
        includeCurrentAffairs: data.includeCurrentAffairs,
        yearFocus: data.yearFocus,
      });

      const result = await routeAIRequest(
        {
          task: "generate_pattern_exam",
          prompt,
          systemPrompt,
          schema: patternGeneratedExamSchema,
          userId: data.userId,
          examId: data.examId,
          temperature: 0.7,
          // System-initiated: bypasses the per-user 10/min quota
          // that would otherwise gate a long batch job on the
          // triggering admin's ceiling.
          bypassUserRateLimit: true,
        },
        db,
      );

      // 3. Persist.
      await job.updateProgress({ stage: "saving", percent: 80 });
      const [exam] = await db.select().from(exams).where(eq(exams.id, data.examId)).limit(1);
      if (!exam) throw new Error("Exam not found");

      const generatedQuestions = result.data.questions.map((q, idx) => ({
        question: q.question,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        subject: q.subject,
        difficulty: q.difficulty,
        questionNumber: idx + 1,
      }));

      const [userExam] = await db
        .insert(userGeneratedExams)
        .values({
          userId: data.userId,
          examId: data.examId,
          title: `${exam.name} — Pattern Exam`,
          questions: generatedQuestions,
          questionCount: generatedQuestions.length,
          ownerType: "user",
          ownerId: data.userId,
        })
        .returning({ id: userGeneratedExams.id });

      if (!userExam) throw new Error("Failed to persist generated exam");

      await job.updateProgress({ stage: "done", percent: 100 });
      console.log(
        `[pattern-exam-gen] Done: ${generatedQuestions.length} questions saved as userExam=${userExam.id}`,
      );

      return {
        userExamId: userExam.id,
        questionCount: generatedQuestions.length,
        patternVersion: pattern.version,
        papersAnalyzed: pattern.papersAnalyzed,
      };
    },
    {
      connection: getBullMQConnection(),
      // One big AI call per job — keep concurrency low.
      concurrency: 1,
      // Safety rate limit at the queue level (provider rate limits
      // also apply at the AI-router level).
      limiter: { max: 4, duration: 60_000 },
    },
  );

  worker.on("completed", (job) => {
    console.log(`[pattern-exam-gen] Job ${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[pattern-exam-gen] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
