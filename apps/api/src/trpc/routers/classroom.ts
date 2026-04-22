import { and, arrayContains, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  classroomMembers,
  classrooms,
  creatorContent,
  creatorProfiles,
  users,
} from "@examforge/shared/db/schema";
import type { Database } from "@examforge/shared/db";
import {
  createClassroomSchema,
  updateClassroomSchema,
  classroomIdInputSchema,
  joinClassroomByCodeSchema,
  assignContentToClassroomSchema,
  removeMemberSchema,
} from "@examforge/shared/validators";
import { router, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";

// 6-char alphanumeric (excluding ambiguous chars) — human-friendly join code
const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateJoinCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
  }
  return out;
}

async function uniqueJoinCode(db: Database): Promise<string> {
  // Randomised — on collision retry up to 5x. With 31^6 ≈ 887M combos,
  // collisions are effectively impossible for the foreseeable future.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateJoinCode();
    const [existing] = await db
      .select({ id: classrooms.id })
      .from(classrooms)
      .where(eq(classrooms.joinCode, code))
      .limit(1);
    if (!existing) return code;
  }
  throw new Error("Could not allocate a unique classroom join code");
}

async function requireCreatorProfile(db: Database, userId: string): Promise<{ id: string }> {
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);
  if (!profile) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a registered creator" });
  }
  return profile;
}

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

export const classroomRouter = router({
  // ─── Creator side ──────────────────────────────────────────────

  create: protectedProcedure.input(createClassroomSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    const profile = await requireCreatorProfile(ctx.db, ctx.userId);
    if (input.isPaid) {
      // Paid classrooms are gated by a separate flag; throws if off.
      await assertCreatorsFeature(ctx.db, "creators.paid_classrooms_enabled");
    }

    const joinCode = await uniqueJoinCode(ctx.db);
    const [row] = await ctx.db
      .insert(classrooms)
      .values({
        teacherId: ctx.userId,
        creatorId: profile.id,
        name: input.name,
        description: input.description,
        examId: input.examId,
        subject: input.subject,
        joinCode,
        maxStudents: input.maxStudents,
        isPaid: input.isPaid,
        feeInr: input.feeInr,
        billingCycle: input.billingCycle,
        academicYear: input.academicYear,
        settings: input.settings ?? {},
        schedule: input.schedule ?? {},
      })
      .returning({ id: classrooms.id, joinCode: classrooms.joinCode });
    if (!row) throw new Error("Failed to create classroom");
    return row;
  }),

  update: protectedProcedure.input(updateClassroomSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    const { classroomId, ...fields } = input;
    await requireTeacherAccess(ctx.db, classroomId, ctx.userId);
    await ctx.db
      .update(classrooms)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(classrooms.id, classroomId));
    return { success: true as const };
  }),

  myTaught: protectedProcedure.query(async ({ ctx }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    return ctx.db
      .select()
      .from(classrooms)
      .where(eq(classrooms.teacherId, ctx.userId))
      .orderBy(desc(classrooms.createdAt));
  }),

  // ─── Student side ──────────────────────────────────────────────

  myEnrolled: protectedProcedure.query(async ({ ctx }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    return ctx.db
      .select({
        id: classrooms.id,
        name: classrooms.name,
        description: classrooms.description,
        subject: classrooms.subject,
        examId: classrooms.examId,
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
  }),

  joinByCode: protectedProcedure
    .input(joinClassroomByCodeSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
      const [classroom] = await ctx.db
        .select()
        .from(classrooms)
        .where(and(eq(classrooms.joinCode, input.joinCode), eq(classrooms.isActive, true)))
        .limit(1);
      if (!classroom) {
        return { success: false as const, reason: "NOT_FOUND" };
      }
      if (classroom.teacherId === ctx.userId) {
        return { success: false as const, reason: "OWN_CLASSROOM" };
      }
      if (classroom.isPaid) {
        return {
          success: false as const,
          reason: "PAYMENT_REQUIRED",
          classroomId: classroom.id,
        };
      }
      if (classroom.studentCount >= classroom.maxStudents) {
        return { success: false as const, reason: "FULL" };
      }
      await ctx.db
        .insert(classroomMembers)
        .values({ classroomId: classroom.id, studentId: ctx.userId, status: "active" })
        .onConflictDoUpdate({
          target: [classroomMembers.classroomId, classroomMembers.studentId],
          set: { status: "active", removedAt: null },
        });
      await ctx.db
        .update(classrooms)
        .set({
          studentCount: sql`(select count(*)::int from ${classroomMembers} where ${classroomMembers.classroomId} = ${classroom.id} and ${classroomMembers.status} = 'active')`,
          updatedAt: new Date(),
        })
        .where(eq(classrooms.id, classroom.id));
      return { success: true as const, classroomId: classroom.id };
    }),

  leave: protectedProcedure.input(classroomIdInputSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    await ctx.db
      .update(classroomMembers)
      .set({ status: "left", removedAt: new Date() })
      .where(
        and(
          eq(classroomMembers.classroomId, input.classroomId),
          eq(classroomMembers.studentId, ctx.userId),
        ),
      );
    await ctx.db
      .update(classrooms)
      .set({
        studentCount: sql`GREATEST(${classrooms.studentCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(classrooms.id, input.classroomId));
    return { success: true as const };
  }),

  // ─── Shared (teacher + student) ────────────────────────────────

  byId: protectedProcedure.input(classroomIdInputSchema).query(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    const { classroom, isTeacher } = await requireMemberOrTeacher(
      ctx.db,
      input.classroomId,
      ctx.userId,
    );
    return { classroom, isTeacher };
  }),

  listMembers: protectedProcedure.input(classroomIdInputSchema).query(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    await requireTeacherAccess(ctx.db, input.classroomId, ctx.userId);
    return ctx.db
      .select({
        id: classroomMembers.id,
        studentId: classroomMembers.studentId,
        name: users.name,
        email: users.email,
        role: classroomMembers.role,
        status: classroomMembers.status,
        joinedAt: classroomMembers.joinedAt,
      })
      .from(classroomMembers)
      .innerJoin(users, eq(users.id, classroomMembers.studentId))
      .where(eq(classroomMembers.classroomId, input.classroomId))
      .orderBy(desc(classroomMembers.joinedAt));
  }),

  removeMember: protectedProcedure.input(removeMemberSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
    await requireTeacherAccess(ctx.db, input.classroomId, ctx.userId);
    await ctx.db
      .update(classroomMembers)
      .set({ status: "removed", removedAt: new Date() })
      .where(
        and(
          eq(classroomMembers.classroomId, input.classroomId),
          eq(classroomMembers.studentId, input.studentId),
        ),
      );
    await ctx.db
      .update(classrooms)
      .set({
        studentCount: sql`GREATEST(${classrooms.studentCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(classrooms.id, input.classroomId));
    return { success: true as const };
  }),

  // ─── Content assignment ────────────────────────────────────────

  assignContent: protectedProcedure
    .input(assignContentToClassroomSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
      const classroom = await requireTeacherAccess(ctx.db, input.classroomId, ctx.userId);
      // Verify the content belongs to this creator
      const [content] = await ctx.db
        .select({ id: creatorContent.id, assigned: creatorContent.assignedClassrooms })
        .from(creatorContent)
        .where(
          and(
            eq(creatorContent.id, input.contentId),
            eq(creatorContent.creatorId, classroom.creatorId),
          ),
        )
        .limit(1);
      if (!content) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Content not found or not owned by this creator",
        });
      }
      const current = content.assigned ?? [];
      if (current.includes(input.classroomId)) {
        return { success: true as const, alreadyAssigned: true };
      }
      await ctx.db
        .update(creatorContent)
        .set({
          assignedClassrooms: [...current, input.classroomId],
          updatedAt: new Date(),
        })
        .where(eq(creatorContent.id, input.contentId));
      return { success: true as const, alreadyAssigned: false };
    }),

  unassignContent: protectedProcedure
    .input(assignContentToClassroomSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
      const classroom = await requireTeacherAccess(ctx.db, input.classroomId, ctx.userId);
      const [content] = await ctx.db
        .select({ id: creatorContent.id, assigned: creatorContent.assignedClassrooms })
        .from(creatorContent)
        .where(
          and(
            eq(creatorContent.id, input.contentId),
            eq(creatorContent.creatorId, classroom.creatorId),
          ),
        )
        .limit(1);
      if (!content) return { success: true as const };
      const current = content.assigned ?? [];
      await ctx.db
        .update(creatorContent)
        .set({
          assignedClassrooms: current.filter((id: string) => id !== input.classroomId),
          updatedAt: new Date(),
        })
        .where(eq(creatorContent.id, input.contentId));
      return { success: true as const };
    }),

  listAssignedContent: protectedProcedure
    .input(classroomIdInputSchema)
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
      await requireMemberOrTeacher(ctx.db, input.classroomId, ctx.userId);
      return ctx.db
        .select({
          id: creatorContent.id,
          title: creatorContent.title,
          description: creatorContent.description,
          contentType: creatorContent.contentType,
          thumbnailUrl: creatorContent.thumbnailUrl,
          isPublished: creatorContent.isPublished,
          createdAt: creatorContent.createdAt,
        })
        .from(creatorContent)
        .where(arrayContains(creatorContent.assignedClassrooms, [input.classroomId]))
        .orderBy(desc(creatorContent.createdAt));
    }),

  listMyContentForAssignment: protectedProcedure
    .input(classroomIdInputSchema)
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
      const classroom = await requireTeacherAccess(ctx.db, input.classroomId, ctx.userId);
      // All content owned by this creator — UI shows which are already assigned.
      return ctx.db
        .select({
          id: creatorContent.id,
          title: creatorContent.title,
          contentType: creatorContent.contentType,
          isPublished: creatorContent.isPublished,
          assignedClassrooms: creatorContent.assignedClassrooms,
        })
        .from(creatorContent)
        .where(eq(creatorContent.creatorId, classroom.creatorId))
        .orderBy(desc(creatorContent.createdAt));
    }),
});
