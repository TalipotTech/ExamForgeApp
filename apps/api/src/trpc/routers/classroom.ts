import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { classroomMembers, classrooms } from "@examforge/shared/db/schema";
import { router, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";

export const classroomRouter = router({
  myClassrooms: protectedProcedure.query(async ({ ctx }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    const rows = await ctx.db
      .select({
        id: classrooms.id,
        name: classrooms.name,
        description: classrooms.description,
        joinCode: classrooms.joinCode,
        isPaid: classrooms.isPaid,
        feeInr: classrooms.feeInr,
        studentCount: classrooms.studentCount,
        nextLiveSession: classrooms.nextLiveSession,
      })
      .from(classroomMembers)
      .innerJoin(classrooms, eq(classrooms.id, classroomMembers.classroomId))
      .where(and(eq(classroomMembers.studentId, ctx.userId), eq(classroomMembers.status, "active")))
      .orderBy(desc(classrooms.createdAt));
    return rows;
  }),

  joinByCode: protectedProcedure
    .input(z.object({ joinCode: z.string().min(4).max(10) }))
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
      const [classroom] = await ctx.db
        .select({ id: classrooms.id, isPaid: classrooms.isPaid })
        .from(classrooms)
        .where(
          and(eq(classrooms.joinCode, input.joinCode.toUpperCase()), eq(classrooms.isActive, true)),
        )
        .limit(1);
      if (!classroom) {
        return { success: false as const, reason: "NOT_FOUND" };
      }
      if (classroom.isPaid) {
        return { success: false as const, reason: "PAYMENT_REQUIRED" };
      }
      await ctx.db
        .insert(classroomMembers)
        .values({ classroomId: classroom.id, studentId: ctx.userId })
        .onConflictDoNothing();
      return { success: true as const, classroomId: classroom.id };
    }),
});
