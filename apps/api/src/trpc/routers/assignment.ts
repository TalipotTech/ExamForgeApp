import { and, asc, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  assignmentSubmissions,
  classroomAssignments,
  classroomMembers,
  classrooms,
  users,
} from "@examforge/shared/db/schema";
import type { Database } from "@examforge/shared/db";
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  assignmentIdInputSchema,
  submitAssignmentSchema,
  gradeSubmissionSchema,
  classroomIdInputSchema,
} from "@examforge/shared/validators";
import { router, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";

async function requireTeacherAccess(
  db: Database,
  classroomId: string,
  userId: string,
): Promise<typeof classrooms.$inferSelect> {
  const [classroom] = await db
    .select()
    .from(classrooms)
    .where(eq(classrooms.id, classroomId))
    .limit(1);
  if (!classroom) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Classroom not found" });
  }
  if (classroom.teacherId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not the teacher of this classroom" });
  }
  return classroom;
}

async function requireMemberOrTeacher(
  db: Database,
  classroomId: string,
  userId: string,
): Promise<{ classroom: typeof classrooms.$inferSelect; isTeacher: boolean }> {
  const [classroom] = await db
    .select()
    .from(classrooms)
    .where(eq(classrooms.id, classroomId))
    .limit(1);
  if (!classroom) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Classroom not found" });
  }
  if (classroom.teacherId === userId) {
    return { classroom, isTeacher: true };
  }
  const [member] = await db
    .select({ id: classroomMembers.id })
    .from(classroomMembers)
    .where(
      and(
        eq(classroomMembers.classroomId, classroomId),
        eq(classroomMembers.studentId, userId),
        eq(classroomMembers.status, "active"),
      ),
    )
    .limit(1);
  if (!member) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this classroom" });
  }
  return { classroom, isTeacher: false };
}

/** Fetch an assignment plus its parent classroom, enforcing role. */
async function requireAssignmentAccess(
  db: Database,
  assignmentId: string,
  userId: string,
): Promise<{
  assignment: typeof classroomAssignments.$inferSelect;
  classroom: typeof classrooms.$inferSelect;
  isTeacher: boolean;
}> {
  const [assignment] = await db
    .select()
    .from(classroomAssignments)
    .where(eq(classroomAssignments.id, assignmentId))
    .limit(1);
  if (!assignment) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });
  }
  const { classroom, isTeacher } = await requireMemberOrTeacher(db, assignment.classroomId, userId);
  return { assignment, classroom, isTeacher };
}

/** Recompute completedCount + averageScore from submissions for an assignment. */
async function recomputeAssignmentStats(db: Database, assignmentId: string): Promise<void> {
  const [stats] = await db
    .select({
      completed: sql<number>`count(*) filter (where ${assignmentSubmissions.status} in ('submitted','graded'))::int`,
      avg: sql<number | null>`avg(${assignmentSubmissions.score})`,
    })
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.assignmentId, assignmentId));
  await db
    .update(classroomAssignments)
    .set({
      completedCount: stats?.completed ?? 0,
      averageScore: stats?.avg ?? null,
    })
    .where(eq(classroomAssignments.id, assignmentId));
}

export const assignmentRouter = router({
  // ─── Teacher ───────────────────────────────────────────

  create: protectedProcedure.input(createAssignmentSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    await requireTeacherAccess(ctx.db, input.classroomId, ctx.userId);

    const [row] = await ctx.db
      .insert(classroomAssignments)
      .values({
        classroomId: input.classroomId,
        assignmentType: "file",
        title: input.title,
        instructions: input.instructions,
        dueAt: input.dueAt,
        attachmentUrl: input.attachmentUrl,
        attachmentFileName: input.attachmentFileName,
        attachmentMimeType: input.attachmentMimeType,
        createdBy: ctx.userId,
      })
      .returning({ id: classroomAssignments.id });
    if (!row) throw new Error("Failed to create assignment");

    // Denormalised student count snapshot — matches classroom state at
    // creation time so teachers can see completion ratio (X / total).
    const [classroom] = await ctx.db
      .select({ studentCount: classrooms.studentCount })
      .from(classrooms)
      .where(eq(classrooms.id, input.classroomId))
      .limit(1);
    await ctx.db
      .update(classroomAssignments)
      .set({ totalStudents: classroom?.studentCount ?? 0 })
      .where(eq(classroomAssignments.id, row.id));

    return { id: row.id };
  }),

  update: protectedProcedure.input(updateAssignmentSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    const { assignment } = await requireAssignmentAccess(ctx.db, input.assignmentId, ctx.userId);
    await requireTeacherAccess(ctx.db, assignment.classroomId, ctx.userId);

    const patch: Partial<typeof classroomAssignments.$inferInsert> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.instructions !== undefined) patch.instructions = input.instructions;
    if (input.dueAt !== undefined) patch.dueAt = input.dueAt;
    if (input.attachmentUrl !== undefined) patch.attachmentUrl = input.attachmentUrl;
    if (input.attachmentFileName !== undefined) patch.attachmentFileName = input.attachmentFileName;
    if (input.attachmentMimeType !== undefined) patch.attachmentMimeType = input.attachmentMimeType;

    if (Object.keys(patch).length > 0) {
      await ctx.db
        .update(classroomAssignments)
        .set(patch)
        .where(eq(classroomAssignments.id, input.assignmentId));
    }
    return { success: true as const };
  }),

  delete: protectedProcedure.input(assignmentIdInputSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    const { assignment } = await requireAssignmentAccess(ctx.db, input.assignmentId, ctx.userId);
    await requireTeacherAccess(ctx.db, assignment.classroomId, ctx.userId);
    await ctx.db
      .delete(classroomAssignments)
      .where(eq(classroomAssignments.id, input.assignmentId));
    return { success: true as const };
  }),

  // ─── Both roles ────────────────────────────────────────

  /** List every assignment in a classroom. Students & teachers get the
   *  same core fields — the student UI decorates with their own submission
   *  state via `mySubmission`. */
  listForClassroom: protectedProcedure
    .input(classroomIdInputSchema)
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
      await requireMemberOrTeacher(ctx.db, input.classroomId, ctx.userId);
      return ctx.db
        .select()
        .from(classroomAssignments)
        .where(eq(classroomAssignments.classroomId, input.classroomId))
        .orderBy(desc(classroomAssignments.createdAt));
    }),

  /** Single assignment with classroom context. Used by the submit + grade
   *  pages on both sides. */
  byId: protectedProcedure.input(assignmentIdInputSchema).query(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    const { assignment, classroom, isTeacher } = await requireAssignmentAccess(
      ctx.db,
      input.assignmentId,
      ctx.userId,
    );
    return {
      assignment,
      classroom: { id: classroom.id, name: classroom.name },
      isTeacher,
    };
  }),

  // ─── Student ───────────────────────────────────────────

  /** Fetch the caller's own submission for one assignment — or null if they
   *  haven't submitted yet. */
  mySubmission: protectedProcedure.input(assignmentIdInputSchema).query(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    await requireAssignmentAccess(ctx.db, input.assignmentId, ctx.userId);
    const [row] = await ctx.db
      .select()
      .from(assignmentSubmissions)
      .where(
        and(
          eq(assignmentSubmissions.assignmentId, input.assignmentId),
          eq(assignmentSubmissions.studentId, ctx.userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }),

  /** Create or update the caller's submission. Idempotent per (assignment,
   *  student) — resubmitting before grading overwrites the prior text/file.
   *  Once graded, further edits are rejected. */
  submit: protectedProcedure.input(submitAssignmentSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    const { isTeacher } = await requireAssignmentAccess(ctx.db, input.assignmentId, ctx.userId);
    if (isTeacher) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Teachers cannot submit to their own assignments",
      });
    }

    const [existing] = await ctx.db
      .select()
      .from(assignmentSubmissions)
      .where(
        and(
          eq(assignmentSubmissions.assignmentId, input.assignmentId),
          eq(assignmentSubmissions.studentId, ctx.userId),
        ),
      )
      .limit(1);

    if (existing?.status === "graded") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This submission has already been graded",
      });
    }

    const now = new Date();
    if (existing) {
      await ctx.db
        .update(assignmentSubmissions)
        .set({
          status: "submitted",
          submissionText: input.submissionText ?? null,
          submissionUrl: input.submissionUrl ?? null,
          submissionFileName: input.submissionFileName ?? null,
          submissionMimeType: input.submissionMimeType ?? null,
          submittedAt: now,
        })
        .where(eq(assignmentSubmissions.id, existing.id));
    } else {
      await ctx.db.insert(assignmentSubmissions).values({
        assignmentId: input.assignmentId,
        studentId: ctx.userId,
        status: "submitted",
        submissionText: input.submissionText,
        submissionUrl: input.submissionUrl,
        submissionFileName: input.submissionFileName,
        submissionMimeType: input.submissionMimeType,
        submittedAt: now,
      });
    }

    await recomputeAssignmentStats(ctx.db, input.assignmentId);
    return { success: true as const };
  }),

  // ─── Teacher grading ───────────────────────────────────

  /** All submissions for an assignment, with the student's display name. */
  listSubmissions: protectedProcedure
    .input(assignmentIdInputSchema)
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
      const { assignment } = await requireAssignmentAccess(ctx.db, input.assignmentId, ctx.userId);
      await requireTeacherAccess(ctx.db, assignment.classroomId, ctx.userId);
      return ctx.db
        .select({
          id: assignmentSubmissions.id,
          studentId: assignmentSubmissions.studentId,
          studentName: users.name,
          studentEmail: users.email,
          status: assignmentSubmissions.status,
          score: assignmentSubmissions.score,
          submissionText: assignmentSubmissions.submissionText,
          submissionUrl: assignmentSubmissions.submissionUrl,
          submissionFileName: assignmentSubmissions.submissionFileName,
          submissionMimeType: assignmentSubmissions.submissionMimeType,
          feedback: assignmentSubmissions.feedback,
          submittedAt: assignmentSubmissions.submittedAt,
          gradedAt: assignmentSubmissions.gradedAt,
        })
        .from(assignmentSubmissions)
        .innerJoin(users, eq(users.id, assignmentSubmissions.studentId))
        .where(eq(assignmentSubmissions.assignmentId, input.assignmentId))
        .orderBy(asc(users.name));
    }),

  grade: protectedProcedure.input(gradeSubmissionSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");

    const [submission] = await ctx.db
      .select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.id, input.submissionId))
      .limit(1);
    if (!submission) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
    }
    const { assignment } = await requireAssignmentAccess(
      ctx.db,
      submission.assignmentId,
      ctx.userId,
    );
    await requireTeacherAccess(ctx.db, assignment.classroomId, ctx.userId);

    await ctx.db
      .update(assignmentSubmissions)
      .set({
        score: input.score,
        feedback: input.feedback ?? null,
        status: "graded",
        gradedBy: ctx.userId,
        gradedAt: new Date(),
      })
      .where(eq(assignmentSubmissions.id, input.submissionId));

    await recomputeAssignmentStats(ctx.db, submission.assignmentId);
    return { success: true as const };
  }),
});
