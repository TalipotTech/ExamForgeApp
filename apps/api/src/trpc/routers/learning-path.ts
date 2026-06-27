import { z } from "zod";
import { and, eq, desc, sql, isNull } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc.js";
import { learningPathAssessments, userProgress } from "@examforge/shared/db/schema";
import { routeAIRequest } from "../../ai/ai-router.js";
import {
  assessLearningPath,
  type NarrationPayload,
  type NarrationResult,
} from "../../lib/learning-path/assess.js";

const TTL_HOURS = Number(process.env.LEARNING_PATH_TTL_HOURS ?? 24);

const narrationSchema = z.object({
  summary: z.string(),
  items: z.array(
    z.object({
      nodeId: z.number(),
      reason: z.string(),
      suggestedAction: z.string(),
    }),
  ),
});

export const learningPathRouter = router({
  get: protectedProcedure
    .input(
      z.object({
        examId: z.string().uuid(),
        subject: z.string().max(255).optional(),
        refresh: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const subjectCond = input.subject
        ? eq(learningPathAssessments.subject, input.subject)
        : isNull(learningPathAssessments.subject);

      // Subject chips — keys of the user's per-subject scores for this exam.
      const [up] = await ctx.db
        .select({ subjectScores: userProgress.subjectScores })
        .from(userProgress)
        .where(and(eq(userProgress.userId, ctx.userId), eq(userProgress.examId, input.examId)))
        .limit(1);
      const subjects = Object.keys(up?.subjectScores ?? {}).sort();

      // Return a fresh-enough cached snapshot unless refresh is requested.
      if (!input.refresh) {
        const [cached] = await ctx.db
          .select()
          .from(learningPathAssessments)
          .where(
            and(
              eq(learningPathAssessments.userId, ctx.userId),
              eq(learningPathAssessments.examId, input.examId),
              subjectCond,
              sql`${learningPathAssessments.createdAt} > now() - (${TTL_HOURS} || ' hours')::interval`,
            ),
          )
          .orderBy(desc(learningPathAssessments.createdAt))
          .limit(1);

        if (cached) {
          return {
            summary: cached.summary ?? "",
            strengths: cached.strengthsJson ?? [],
            improvements: cached.improvementsJson ?? [],
            overallScore: cached.overallScore ? Number(cached.overallScore) : 0,
            isEmpty:
              (cached.improvementsJson ?? []).length === 0 &&
              (cached.strengthsJson ?? []).length === 0,
            cached: true,
            generatedAt: cached.createdAt,
            subjects,
          };
        }
      }

      // Compute fresh — ranking + score deterministic, AI only phrases prose.
      const narrate = async (payload: NarrationPayload): Promise<NarrationResult | null> => {
        try {
          const lines = payload.improvements
            .map(
              (i, idx) => `${idx + 1}. [node ${i.nodeId}] ${i.title} — signal: ${i.signalSummary}`,
            )
            .join("\n");
          const systemPrompt = `You are a study coach for an Indian exam-prep platform. You are given a ranked list of topics a student should improve, plus their topics of strength and an overall readiness score. Write ONLY encouraging, concise phrasing — do NOT invent topics, do NOT change the ranking or score. Return JSON: a short motivating "summary" (<=40 words) and, for EACH given node, a one-line "reason" (<=18 words) and a concrete "suggestedAction" (<=12 words, e.g. "Read the tutorial then attempt 10 MCQs"). Keep nodeIds exactly as given.`;
          const prompt = `Overall readiness: ${payload.overallScore}%.\nStrengths: ${payload.strengthTitles.join(", ") || "none yet"}.\nImprove these topics:\n${lines}`;

          const result = await routeAIRequest(
            {
              task: "assess_learning_path",
              prompt,
              systemPrompt,
              schema: narrationSchema,
              userId: ctx.userId,
              examId: input.examId,
              temperature: 0.4,
              maxTokens: 800,
            },
            ctx.db,
          );
          return {
            summary: result.data.summary,
            items: result.data.items,
            model: result.model,
            costUsd: result.estimatedCostUsd,
          };
        } catch {
          return null;
        }
      };

      const assessment = await assessLearningPath(
        ctx.db,
        {
          userId: ctx.userId,
          orgId: ctx.orgId ?? "",
          examId: input.examId,
          subject: input.subject,
        },
        { narrate },
      );

      // Persist snapshot (cache for TTL window).
      await ctx.db
        .insert(learningPathAssessments)
        .values({
          userId: ctx.userId,
          orgId: ctx.orgId,
          examId: input.examId,
          subject: input.subject ?? null,
          signalsJson: assessment.signals,
          summary: assessment.summary,
          strengthsJson: assessment.strengths,
          improvementsJson: assessment.improvements,
          overallScore: String(assessment.overallScore),
          generationModel: assessment.model,
          generationCost: String(assessment.costUsd),
        })
        .catch(() => {
          // snapshot persistence is best-effort; still return the result
        });

      return {
        summary: assessment.summary,
        strengths: assessment.strengths,
        improvements: assessment.improvements,
        overallScore: assessment.overallScore,
        isEmpty: assessment.isEmpty,
        cached: false,
        generatedAt: new Date(),
        subjects,
      };
    }),
});
