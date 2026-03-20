import { eq, and, sql, asc, desc } from "drizzle-orm";
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { exams, users, userExams } from "@examforge/shared/db/schema";
import { saveSelectedExamsSchema } from "@examforge/shared/validators";

export const onboardingRouter = router({
  // ─── List Available Exams ───
  listAvailableExams: publicProcedure.query(async ({ ctx }) => {
    // Get exams with syllabus count
    const examRows = await ctx.db
      .select({
        id: exams.id,
        name: exams.name,
        category: exams.category,
        conductingBody: exams.conductingBody,
        examDate: exams.examDate,
        questionCount: exams.questionCount,
        syllabusUrl: exams.syllabusUrl,
        isFeatured: exams.isFeatured,
        syllabusCount:
          sql<number>`(SELECT COUNT(*) FROM syllabi WHERE syllabi.exam_id = ${exams.id} AND syllabi.status = 'parsed')`.as(
            "syllabus_count",
          ),
      })
      .from(exams)
      .where(eq(exams.isActive, true))
      .orderBy(desc(exams.isFeatured), asc(exams.examDate), asc(exams.name));

    return examRows;
  }),

  // ─── Save Selected Exams ───
  saveSelectedExams: protectedProcedure
    .input(saveSelectedExamsSchema)
    .mutation(async ({ ctx, input }) => {
      // Upsert each selected exam
      for (const exam of input.exams) {
        // Check if already exists
        const [existing] = await ctx.db
          .select({ id: userExams.id })
          .from(userExams)
          .where(and(eq(userExams.userId, ctx.userId), eq(userExams.examId, exam.examId)))
          .limit(1);

        if (existing) {
          await ctx.db
            .update(userExams)
            .set({
              targetScore: exam.targetScore ?? null,
              priority: exam.priority ?? 1,
              isActive: true,
              updatedAt: new Date(),
            })
            .where(eq(userExams.id, existing.id));
        } else {
          await ctx.db.insert(userExams).values({
            userId: ctx.userId,
            examId: exam.examId,
            targetScore: exam.targetScore ?? null,
            priority: exam.priority ?? 1,
          });
        }
      }

      // Mark onboarding as completed
      await ctx.db
        .update(users)
        .set({
          onboardingCompleted: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.userId));

      return { success: true };
    }),

  // ─── Skip Onboarding ───
  skipOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(users)
      .set({
        onboardingCompleted: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, ctx.userId));

    return { success: true };
  }),

  // ─── Get Onboarding Status ───
  getOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await ctx.db
      .select({ onboardingCompleted: users.onboardingCompleted })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    const selectedExams = await ctx.db
      .select({
        examId: userExams.examId,
        examName: exams.name,
        targetScore: userExams.targetScore,
        priority: userExams.priority,
      })
      .from(userExams)
      .innerJoin(exams, eq(exams.id, userExams.examId))
      .where(and(eq(userExams.userId, ctx.userId), eq(userExams.isActive, true)));

    return {
      completed: user?.onboardingCompleted ?? false,
      selectedExams,
    };
  }),

  // ─── Remove User Exam ───
  removeUserExam: protectedProcedure
    .input(z.object({ examId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(userExams)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(userExams.userId, ctx.userId), eq(userExams.examId, input.examId)));
      return { success: true };
    }),

  // ─── Add User Exam (post-onboarding) ───
  addUserExam: protectedProcedure
    .input(
      z.object({
        examId: z.string().uuid(),
        targetScore: z.number().int().min(0).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: userExams.id })
        .from(userExams)
        .where(and(eq(userExams.userId, ctx.userId), eq(userExams.examId, input.examId)))
        .limit(1);

      if (existing) {
        await ctx.db
          .update(userExams)
          .set({
            isActive: true,
            targetScore: input.targetScore ?? null,
            updatedAt: new Date(),
          })
          .where(eq(userExams.id, existing.id));
      } else {
        await ctx.db.insert(userExams).values({
          userId: ctx.userId,
          examId: input.examId,
          targetScore: input.targetScore ?? null,
        });
      }

      return { success: true };
    }),
});
