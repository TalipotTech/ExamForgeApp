import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  classroomMembers,
  classrooms,
  creatorContent,
  creatorProfiles,
  doubtResponses,
  doubts,
  users,
} from "@examforge/shared/db/schema";
import {
  askDoubtSchema,
  respondToDoubtSchema,
  doubtIdInputSchema,
  classroomDoubtsInputSchema,
  myDoubtsInputSchema,
} from "@examforge/shared/validators";
import { router, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";

export const doubtRouter = router({
  // ─── Student ───────────────────────────────────────────────

  myDoubts: protectedProcedure
    .input(myDoubtsInputSchema.optional())
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.doubts_enabled");
      const conds: SQL[] = [eq(doubts.studentId, ctx.userId)];
      if (input?.status) conds.push(eq(doubts.status, input.status));
      return ctx.db
        .select()
        .from(doubts)
        .where(and(...conds))
        .orderBy(desc(doubts.createdAt))
        .limit(input?.limit ?? 50);
    }),

  ask: protectedProcedure.input(askDoubtSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.doubts_enabled");

    // If asked in a classroom, verify caller is a member of that classroom
    if (input.classroomId) {
      const [membership] = await ctx.db
        .select({ id: classroomMembers.id })
        .from(classroomMembers)
        .where(
          and(
            eq(classroomMembers.classroomId, input.classroomId),
            eq(classroomMembers.studentId, ctx.userId),
            eq(classroomMembers.status, "active"),
          ),
        )
        .limit(1);
      if (!membership) {
        // Might also be the teacher asking a self-note, but that's uncommon;
        // check teacher access too.
        const [cls] = await ctx.db
          .select({ teacherId: classrooms.teacherId })
          .from(classrooms)
          .where(eq(classrooms.id, input.classroomId))
          .limit(1);
        if (!cls || cls.teacherId !== ctx.userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not a member of this classroom",
          });
        }
      }
    }

    // If the doubt targets a specific creator but didn't include one,
    // derive it from the content or classroom when possible.
    let creatorUserId = input.creatorId;
    if (!creatorUserId && input.contentId) {
      const [content] = await ctx.db
        .select({ creatorId: creatorContent.creatorId })
        .from(creatorContent)
        .where(eq(creatorContent.id, input.contentId))
        .limit(1);
      if (content) {
        const [profile] = await ctx.db
          .select({ userId: creatorProfiles.userId })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.id, content.creatorId))
          .limit(1);
        if (profile) creatorUserId = profile.userId;
      }
    }
    if (!creatorUserId && input.classroomId) {
      const [cls] = await ctx.db
        .select({ teacherId: classrooms.teacherId })
        .from(classrooms)
        .where(eq(classrooms.id, input.classroomId))
        .limit(1);
      if (cls) creatorUserId = cls.teacherId;
    }

    const [created] = await ctx.db
      .insert(doubts)
      .values({
        studentId: ctx.userId,
        creatorId: creatorUserId,
        contentId: input.contentId,
        classroomId: input.classroomId,
        syllabusNodeId: input.syllabusNodeId,
        questionText: input.questionText,
        questionImages: input.images ?? [],
        isPublic: input.isPublic,
      })
      .returning({ id: doubts.id });
    if (!created) throw new Error("Failed to create doubt");
    return { id: created.id };
  }),

  // ─── Creator ──────────────────────────────────────────────

  /**
   * Creator's doubt inbox: doubts addressed directly to them + any doubt in
   * a classroom they teach. Defaults to open/unanswered status.
   */
  inbox: protectedProcedure.query(async ({ ctx }) => {
    await assertCreatorsFeature(ctx.db, "creators.doubts_enabled");
    const ownedClassrooms = await ctx.db
      .select({ id: classrooms.id })
      .from(classrooms)
      .where(eq(classrooms.teacherId, ctx.userId));
    const classroomIds = ownedClassrooms.map((c) => c.id);
    const audienceCond = classroomIds.length
      ? or(eq(doubts.creatorId, ctx.userId), inArray(doubts.classroomId, classroomIds))
      : eq(doubts.creatorId, ctx.userId);
    return ctx.db
      .select()
      .from(doubts)
      .where(and(audienceCond!, eq(doubts.status, "open")))
      .orderBy(desc(doubts.createdAt))
      .limit(100);
  }),

  respond: protectedProcedure.input(respondToDoubtSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.doubts_enabled");
    const [doubt] = await ctx.db.select().from(doubts).where(eq(doubts.id, input.doubtId)).limit(1);
    if (!doubt) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Doubt not found" });
    }

    // Permission: creator directly addressed, or teacher of a classroom
    // the doubt belongs to.
    let allowed = doubt.creatorId === ctx.userId;
    if (!allowed && doubt.classroomId) {
      const [cls] = await ctx.db
        .select({ teacherId: classrooms.teacherId })
        .from(classrooms)
        .where(eq(classrooms.id, doubt.classroomId))
        .limit(1);
      if (cls && cls.teacherId === ctx.userId) allowed = true;
    }
    if (!allowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have permission to answer this doubt",
      });
    }

    // TODO: image-gen — for AI doubt answers that need a visual, generate a
    // diagram via generateImage({ purpose: 'doubt_visualization' }) and
    // attach its cdnUrl to the response.
    await ctx.db.insert(doubtResponses).values({
      doubtId: input.doubtId,
      responderId: ctx.userId,
      responseText: input.responseText,
      responseType: "text",
      isAi: false,
    });
    if (input.markAsAnswered) {
      await ctx.db
        .update(doubts)
        .set({
          status: "creator_answered",
          creatorId: ctx.userId,
          updatedAt: new Date(),
        })
        .where(eq(doubts.id, input.doubtId));
    }
    // Bump content.doubt_count if scoped to a piece of content
    if (doubt.contentId) {
      await ctx.db
        .update(creatorContent)
        .set({
          doubtCount: sql`${creatorContent.doubtCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(creatorContent.id, doubt.contentId));
    }
    return { success: true as const };
  }),

  close: protectedProcedure.input(doubtIdInputSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.doubts_enabled");
    const [doubt] = await ctx.db.select().from(doubts).where(eq(doubts.id, input.doubtId)).limit(1);
    if (!doubt) throw new TRPCError({ code: "NOT_FOUND", message: "Doubt not found" });
    // Student or addressed creator can close
    let allowed = doubt.studentId === ctx.userId || doubt.creatorId === ctx.userId;
    if (!allowed && doubt.classroomId) {
      const [cls] = await ctx.db
        .select({ teacherId: classrooms.teacherId })
        .from(classrooms)
        .where(eq(classrooms.id, doubt.classroomId))
        .limit(1);
      if (cls && cls.teacherId === ctx.userId) allowed = true;
    }
    if (!allowed) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Cannot close this doubt" });
    }
    await ctx.db
      .update(doubts)
      .set({ status: "closed", updatedAt: new Date() })
      .where(eq(doubts.id, input.doubtId));
    return { success: true as const };
  }),

  // ─── Shared ───────────────────────────────────────────────

  /** Full thread: the doubt + all responses with responder names. */
  byId: protectedProcedure.input(doubtIdInputSchema).query(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.doubts_enabled");
    const [doubt] = await ctx.db.select().from(doubts).where(eq(doubts.id, input.doubtId)).limit(1);
    if (!doubt) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Doubt not found" });
    }

    // Audience check: student, addressed creator, or member/teacher of the
    // classroom (if scoped to one and public), or a public doubt.
    let allowed =
      doubt.studentId === ctx.userId || doubt.creatorId === ctx.userId || doubt.isPublic;
    if (!allowed && doubt.classroomId) {
      const [member] = await ctx.db
        .select({ id: classroomMembers.id })
        .from(classroomMembers)
        .where(
          and(
            eq(classroomMembers.classroomId, doubt.classroomId),
            eq(classroomMembers.studentId, ctx.userId),
            eq(classroomMembers.status, "active"),
          ),
        )
        .limit(1);
      if (member) allowed = true;
      if (!allowed) {
        const [cls] = await ctx.db
          .select({ teacherId: classrooms.teacherId })
          .from(classrooms)
          .where(eq(classrooms.id, doubt.classroomId))
          .limit(1);
        if (cls && cls.teacherId === ctx.userId) allowed = true;
      }
    }
    if (!allowed) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Cannot view this doubt" });
    }

    const responses = await ctx.db
      .select({
        id: doubtResponses.id,
        responderId: doubtResponses.responderId,
        responderName: users.name,
        responseText: doubtResponses.responseText,
        responseType: doubtResponses.responseType,
        mediaUrl: doubtResponses.mediaUrl,
        isAi: doubtResponses.isAi,
        isAccepted: doubtResponses.isAccepted,
        createdAt: doubtResponses.createdAt,
      })
      .from(doubtResponses)
      .innerJoin(users, eq(users.id, doubtResponses.responderId))
      .where(eq(doubtResponses.doubtId, input.doubtId))
      .orderBy(doubtResponses.createdAt);

    return { doubt, responses };
  }),

  listForClassroom: protectedProcedure
    .input(classroomDoubtsInputSchema)
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.doubts_enabled");
      // Audience check — teacher or active member
      const [cls] = await ctx.db
        .select({ teacherId: classrooms.teacherId })
        .from(classrooms)
        .where(eq(classrooms.id, input.classroomId))
        .limit(1);
      if (!cls) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Classroom not found" });
      }
      if (cls.teacherId !== ctx.userId) {
        const [member] = await ctx.db
          .select({ id: classroomMembers.id })
          .from(classroomMembers)
          .where(
            and(
              eq(classroomMembers.classroomId, input.classroomId),
              eq(classroomMembers.studentId, ctx.userId),
              eq(classroomMembers.status, "active"),
            ),
          )
          .limit(1);
        if (!member) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not a classroom member" });
        }
      }
      const conds: SQL[] = [eq(doubts.classroomId, input.classroomId)];
      if (input.status) conds.push(eq(doubts.status, input.status));
      return ctx.db
        .select({
          id: doubts.id,
          studentId: doubts.studentId,
          studentName: users.name,
          questionText: doubts.questionText,
          status: doubts.status,
          isPublic: doubts.isPublic,
          upvoteCount: doubts.upvoteCount,
          createdAt: doubts.createdAt,
        })
        .from(doubts)
        .innerJoin(users, eq(users.id, doubts.studentId))
        .where(and(...conds))
        .orderBy(desc(doubts.createdAt))
        .limit(input.limit);
    }),
});
