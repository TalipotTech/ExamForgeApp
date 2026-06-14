import { and, arrayContains, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
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

  /**
   * Aggregated view for the student dashboard: every piece of creator content
   * assigned to ANY classroom the student is actively enrolled in, newest
   * first. Returns enough shape for the dashboard card grid (thumbnail,
   * metadata with mediaItems for video previews, plus the first matching
   * classroom name so the card can badge which class it came from).
   *
   * Implementation notes:
   * - `assignedClassrooms` is a JSONB string[] column, so postgres `&&`
   *   (arrayOverlaps) is NOT valid here — that operator only works on
   *   native arrays. We fall back to OR-ing N `jsonb @> '[id]'` clauses
   *   (one per classroom the student is in). Worst case the student is
   *   enrolled in a few classrooms, so this stays cheap.
   * - We only select the columns the card actually needs. `metadata` is
   *   returned as `unknown` (JSONB) and parsed client-side — same pattern
   *   the creator dashboard uses.
   */
  myAssignedContent: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(12) }).optional())
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");
      const limit = input?.limit ?? 12;

      const memberships = await ctx.db
        .select({ classroomId: classroomMembers.classroomId })
        .from(classroomMembers)
        .where(
          and(eq(classroomMembers.studentId, ctx.userId), eq(classroomMembers.status, "active")),
        );
      if (memberships.length === 0) return [];

      const classroomIds = memberships.map((m) => m.classroomId);

      // OR of `assignedClassrooms @> '[<id>]'` for each enrolled classroom.
      // arrayContains on a JSONB column emits `@>`, which works for jsonb
      // containment semantics.
      const overlapClauses = classroomIds.map((id) =>
        arrayContains(creatorContent.assignedClassrooms, [id]),
      );
      const overlap = or(...overlapClauses) as SQL;

      const rows = await ctx.db
        .select({
          id: creatorContent.id,
          title: creatorContent.title,
          description: creatorContent.description,
          contentType: creatorContent.contentType,
          thumbnailUrl: creatorContent.thumbnailUrl,
          isPublished: creatorContent.isPublished,
          viewCount: creatorContent.viewCount,
          createdAt: creatorContent.createdAt,
          metadata: creatorContent.metadata,
          assignedClassrooms: creatorContent.assignedClassrooms,
          creatorId: creatorContent.creatorId,
          subject: creatorContent.subject,
          topic: creatorContent.topic,
        })
        .from(creatorContent)
        .where(overlap)
        .orderBy(desc(creatorContent.createdAt))
        .limit(limit);

      if (rows.length === 0) return [];

      // Side-load classroom + creator display info for the card label.
      const [classroomRows, creatorRows] = await Promise.all([
        ctx.db
          .select({ id: classrooms.id, name: classrooms.name })
          .from(classrooms)
          .where(inArray(classrooms.id, classroomIds)),
        ctx.db
          .select({ id: creatorProfiles.id, displayName: creatorProfiles.displayName })
          .from(creatorProfiles)
          .where(inArray(creatorProfiles.id, Array.from(new Set(rows.map((r) => r.creatorId))))),
      ]);
      const classroomMap = new Map(classroomRows.map((c) => [c.id, c]));
      const creatorMap = new Map(creatorRows.map((c) => [c.id, c]));

      return rows.map((row) => {
        // An item may be assigned to multiple of the student's classrooms;
        // we surface the first matching one as the badge on the card. The
        // student can still see the full list by opening the content.
        const assigned = (row.assignedClassrooms ?? []) as string[];
        const firstMatch = assigned.find((id) => classroomMap.has(id));
        const classroom = firstMatch ? (classroomMap.get(firstMatch) ?? null) : null;
        const creator = creatorMap.get(row.creatorId) ?? null;
        return {
          id: row.id,
          title: row.title,
          description: row.description,
          contentType: row.contentType,
          thumbnailUrl: row.thumbnailUrl,
          isPublished: row.isPublished,
          viewCount: row.viewCount,
          createdAt: row.createdAt,
          metadata: row.metadata,
          subject: row.subject,
          topic: row.topic,
          classroomId: classroom?.id ?? null,
          classroomName: classroom?.name ?? null,
          creatorDisplayName: creator?.displayName ?? null,
        };
      });
    }),

  /**
   * Student-side: fetch a single piece of creator content by id, but only if
   * it's assigned to a classroom the caller is actively enrolled in. Returns
   * the full row plus parsed mediaItems (same shape the MediaPreview
   * component consumes on both the creator and student pages).
   *
   * Access model:
   *   1. Caller must be an active member of at least one classroom.
   *   2. `content.assignedClassrooms` must overlap that set.
   *
   * Errors:
   *   - FORBIDDEN if the caller has no classroom memberships or the content
   *     isn't assigned to one of them.
   *   - NOT_FOUND if the content id doesn't exist.
   */
  getAssignedContentById: protectedProcedure
    .input(z.object({ contentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");

      const memberships = await ctx.db
        .select({ classroomId: classroomMembers.classroomId })
        .from(classroomMembers)
        .where(
          and(eq(classroomMembers.studentId, ctx.userId), eq(classroomMembers.status, "active")),
        );
      if (memberships.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You're not enrolled in any classrooms.",
        });
      }
      const classroomIds = memberships.map((m) => m.classroomId);

      const [content] = await ctx.db
        .select()
        .from(creatorContent)
        .where(eq(creatorContent.id, input.contentId))
        .limit(1);
      if (!content) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Content not found" });
      }

      const assigned = (content.assignedClassrooms ?? []) as string[];
      const matchedClassroomId = assigned.find((id) => classroomIds.includes(id));
      if (!matchedClassroomId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This content isn't assigned to any of your classrooms.",
        });
      }

      // Parse mediaItems out of metadata, sorted by `order` so the preview
      // renders them in upload order. Defensive against malformed rows.
      const meta = content.metadata;
      let mediaItems: unknown[] = [];
      if (meta && typeof meta === "object") {
        const raw = (meta as { mediaItems?: unknown }).mediaItems;
        if (Array.isArray(raw)) {
          mediaItems = [...raw].sort((a, b) => {
            const ao =
              a && typeof a === "object" && typeof (a as { order?: unknown }).order === "number"
                ? (a as { order: number }).order
                : 0;
            const bo =
              b && typeof b === "object" && typeof (b as { order?: unknown }).order === "number"
                ? (b as { order: number }).order
                : 0;
            return ao - bo;
          });
        }
      }

      const [classroomRow] = await ctx.db
        .select({ id: classrooms.id, name: classrooms.name })
        .from(classrooms)
        .where(eq(classrooms.id, matchedClassroomId))
        .limit(1);
      const [creatorRow] = await ctx.db
        .select({
          id: creatorProfiles.id,
          displayName: creatorProfiles.displayName,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, content.creatorId))
        .limit(1);

      return {
        ...content,
        mediaItems,
        classroom: classroomRow ?? null,
        creatorDisplayName: creatorRow?.displayName ?? null,
      };
    }),

  /**
   * Increment `creator_content.view_count` for a piece of assigned content.
   * Called by the student viewer once per page visit (useEffect on id).
   *
   * Access is gated identically to `getAssignedContentById`: caller must be
   * an active member of a classroom this content is assigned to. Without
   * that check, anyone with a valid content UUID could inflate counters.
   *
   * The update is atomic (`SET view_count = view_count + 1`) so concurrent
   * opens from multiple students don't race. We also skip incrementing when
   * the caller is the content's own creator — creators previewing their own
   * drafts shouldn't inflate their public metrics.
   */
  recordContentView: protectedProcedure
    .input(z.object({ contentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.classrooms_enabled");

      const memberships = await ctx.db
        .select({ classroomId: classroomMembers.classroomId })
        .from(classroomMembers)
        .where(
          and(eq(classroomMembers.studentId, ctx.userId), eq(classroomMembers.status, "active")),
        );
      if (memberships.length === 0) {
        return { recorded: false as const };
      }
      const classroomIds = new Set(memberships.map((m) => m.classroomId));

      const [content] = await ctx.db
        .select({
          id: creatorContent.id,
          creatorId: creatorContent.creatorId,
          assignedClassrooms: creatorContent.assignedClassrooms,
        })
        .from(creatorContent)
        .where(eq(creatorContent.id, input.contentId))
        .limit(1);
      if (!content) return { recorded: false as const };

      const assigned = (content.assignedClassrooms ?? []) as string[];
      const hasAccess = assigned.some((id) => classroomIds.has(id));
      if (!hasAccess) return { recorded: false as const };

      // Don't inflate on a creator previewing their own material — look up
      // the caller's creator profile (if any) and short-circuit on match.
      const [ownProfile] = await ctx.db
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, ctx.userId))
        .limit(1);
      if (ownProfile && ownProfile.id === content.creatorId) {
        return { recorded: false as const };
      }

      await ctx.db
        .update(creatorContent)
        .set({ viewCount: sql`${creatorContent.viewCount} + 1` })
        .where(eq(creatorContent.id, input.contentId));

      return { recorded: true as const };
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
      // `metadata` + `viewCount` are surfaced so the classroom content tab
      // can render the same ContentCard grid used on the dashboard
      // (hover-autoplay video previews + image thumbnails pulled out of
      // `metadata.mediaItems`). `subject` / `topic` / the creator's display
      // name go into the card's secondary meta row ("Subject › Topic · by
      // Creator"). LEFT JOIN on creator_profiles keeps rows with a deleted
      // creator profile from dropping out of the list.
      return ctx.db
        .select({
          id: creatorContent.id,
          title: creatorContent.title,
          description: creatorContent.description,
          contentType: creatorContent.contentType,
          thumbnailUrl: creatorContent.thumbnailUrl,
          isPublished: creatorContent.isPublished,
          createdAt: creatorContent.createdAt,
          metadata: creatorContent.metadata,
          viewCount: creatorContent.viewCount,
          subject: creatorContent.subject,
          topic: creatorContent.topic,
          creatorDisplayName: creatorProfiles.displayName,
        })
        .from(creatorContent)
        .leftJoin(creatorProfiles, eq(creatorProfiles.id, creatorContent.creatorId))
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
