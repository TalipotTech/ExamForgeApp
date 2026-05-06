import { and, asc, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  classroomMembers,
  classrooms,
  creatorProfiles,
  liveSessionAttendees,
  liveSessions,
  users,
} from "@examforge/shared/db/schema";
import type { Database } from "@examforge/shared/db";
import {
  scheduleLiveSessionSchema,
  liveSessionIdInputSchema,
  listLiveSessionsInputSchema,
  markLeftSchema,
  setRecordingUrlSchema,
} from "@examforge/shared/validators";
import { router, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";

// 30-minute grace window after scheduled end before we auto-flip a session
// to `ended`. Long enough to absorb sessions that run a little over without
// requiring creators to manually close them.
const ENDED_GRACE_MINUTES = 30;

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

async function requireSessionOwner(
  db: Database,
  sessionId: string,
  userId: string,
): Promise<{ session: typeof liveSessions.$inferSelect; creatorId: string }> {
  const profile = await requireCreatorProfile(db, userId);
  const [session] = await db
    .select()
    .from(liveSessions)
    .where(eq(liveSessions.id, sessionId))
    .limit(1);
  if (!session) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Live session not found" });
  }
  if (session.creatorId !== profile.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not the host of this session" });
  }
  return { session, creatorId: profile.id };
}

/**
 * Verify the caller can see/join a session — either the host (creator) or,
 * for classroom-bound sessions, an active member. Standalone sessions
 * (no classroomId) are visible to any authenticated user.
 */
async function requireSessionAccess(
  db: Database,
  sessionId: string,
  userId: string,
): Promise<{ session: typeof liveSessions.$inferSelect; isHost: boolean }> {
  const [session] = await db
    .select()
    .from(liveSessions)
    .where(eq(liveSessions.id, sessionId))
    .limit(1);
  if (!session) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Live session not found" });
  }
  // Host?
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);
  if (profile && profile.id === session.creatorId) {
    return { session, isHost: true };
  }
  if (!session.classroomId) {
    return { session, isHost: false };
  }
  const [member] = await db
    .select({ id: classroomMembers.id })
    .from(classroomMembers)
    .where(
      and(
        eq(classroomMembers.classroomId, session.classroomId),
        eq(classroomMembers.studentId, userId),
        eq(classroomMembers.status, "active"),
      ),
    )
    .limit(1);
  if (!member) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not a member of this session's classroom",
    });
  }
  return { session, isHost: false };
}

/**
 * Lazy state machine: any read that lands on a session past its scheduled
 * end + grace window flips it to `ended` so listings stay coherent without
 * a separate cron. `live` → `ended` only; never resurrects cancelled rows.
 */
async function autoEndIfElapsed(
  db: Database,
  session: typeof liveSessions.$inferSelect,
): Promise<typeof liveSessions.$inferSelect> {
  if (session.status !== "scheduled" && session.status !== "live") return session;
  const duration = session.durationMinutes ?? 60;
  const endsAt = new Date(
    session.scheduledAt.getTime() + (duration + ENDED_GRACE_MINUTES) * 60_000,
  );
  if (Date.now() < endsAt.getTime()) return session;
  const now = new Date();
  await db
    .update(liveSessions)
    .set({ status: "ended", endedAt: session.endedAt ?? now })
    .where(eq(liveSessions.id, session.id));
  return { ...session, status: "ended", endedAt: session.endedAt ?? now };
}

/** Apply autoEndIfElapsed in bulk — run before returning a list to the UI. */
async function reapElapsed(
  db: Database,
  rows: (typeof liveSessions.$inferSelect)[],
): Promise<(typeof liveSessions.$inferSelect)[]> {
  const reaped = await Promise.all(rows.map((r) => autoEndIfElapsed(db, r)));
  return reaped;
}

export const liveSessionRouter = router({
  // ─── Creator ───────────────────────────────────────────

  schedule: protectedProcedure.input(scheduleLiveSessionSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
    const profile = await requireCreatorProfile(ctx.db, ctx.userId);

    // If the session is bound to a classroom, the caller must own it.
    if (input.classroomId) {
      const [classroom] = await ctx.db
        .select({ teacherId: classrooms.teacherId })
        .from(classrooms)
        .where(eq(classrooms.id, input.classroomId))
        .limit(1);
      if (!classroom) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Classroom not found" });
      }
      if (classroom.teacherId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not the teacher of this classroom",
        });
      }
    }

    const [row] = await ctx.db
      .insert(liveSessions)
      .values({
        creatorId: profile.id,
        classroomId: input.classroomId,
        title: input.title,
        description: input.description,
        scheduledAt: input.scheduledAt,
        durationMinutes: input.durationMinutes,
        meetingType: "external",
        meetingUrl: input.meetingUrl,
        subject: input.subject,
        topic: input.topic,
        isFree: input.isFree,
        priceInr: input.priceInr,
        status: "scheduled",
      })
      .returning({ id: liveSessions.id });
    if (!row) throw new Error("Failed to create live session");
    return { id: row.id };
  }),

  cancel: protectedProcedure.input(liveSessionIdInputSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
    const { session } = await requireSessionOwner(ctx.db, input.sessionId, ctx.userId);
    if (session.status === "ended") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot cancel a session that has already ended",
      });
    }
    await ctx.db
      .update(liveSessions)
      .set({ status: "cancelled" })
      .where(eq(liveSessions.id, input.sessionId));
    return { success: true as const };
  }),

  setRecordingUrl: protectedProcedure
    .input(setRecordingUrlSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
      await requireSessionOwner(ctx.db, input.sessionId, ctx.userId);
      await ctx.db
        .update(liveSessions)
        .set({ recordingUrl: input.recordingUrl, isRecorded: true })
        .where(eq(liveSessions.id, input.sessionId));
      return { success: true as const };
    }),

  /** All sessions hosted by the calling creator, newest scheduled first. */
  myHosted: protectedProcedure.query(async ({ ctx }) => {
    await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
    const profile = await requireCreatorProfile(ctx.db, ctx.userId);
    const rows = await ctx.db
      .select()
      .from(liveSessions)
      .where(eq(liveSessions.creatorId, profile.id))
      .orderBy(desc(liveSessions.scheduledAt));
    return reapElapsed(ctx.db, rows);
  }),

  // ─── Both roles ────────────────────────────────────────

  /** Upcoming = scheduled, end-time still in the future. Optionally scoped
   *  to a classroom. Joined to creator displayName so the UI can render
   *  "by …" without a second query. */
  listUpcoming: protectedProcedure
    .input(listLiveSessionsInputSchema.optional())
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
      const limit = input?.limit ?? 50;
      const conds = [
        or(eq(liveSessions.status, "scheduled"), eq(liveSessions.status, "live"))!,
        // end-time = scheduled + duration + grace; we want sessions whose end
        // hasn't passed yet so a session that started 10 min ago still shows.
        gte(
          sql`${liveSessions.scheduledAt} + (coalesce(${liveSessions.durationMinutes}, 60) + ${ENDED_GRACE_MINUTES}) * interval '1 minute'`,
          new Date(),
        ),
      ];
      if (input?.classroomId) {
        conds.push(eq(liveSessions.classroomId, input.classroomId));
      }
      const rows = await ctx.db
        .select({
          session: liveSessions,
          creatorName: creatorProfiles.displayName,
          creatorId: creatorProfiles.id,
        })
        .from(liveSessions)
        .innerJoin(creatorProfiles, eq(creatorProfiles.id, liveSessions.creatorId))
        .where(and(...conds))
        .orderBy(asc(liveSessions.scheduledAt))
        .limit(limit);
      // Reap any rows whose grace window has now passed (race against TZ skew).
      const reaped = await reapElapsed(
        ctx.db,
        rows.map((r) => r.session),
      );
      return rows
        .map((r, i) => ({ ...r.session, ...reaped[i], creatorName: r.creatorName }))
        .filter((r) => r.status === "scheduled" || r.status === "live");
    }),

  /** Past sessions for the caller — ended OR cancelled. Recording link
   *  surfaces here for replays. */
  listPast: protectedProcedure
    .input(listLiveSessionsInputSchema.optional())
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
      const limit = input?.limit ?? 50;
      const conds = [or(eq(liveSessions.status, "ended"), eq(liveSessions.status, "cancelled"))!];
      if (input?.classroomId) {
        conds.push(eq(liveSessions.classroomId, input.classroomId));
      }
      const rows = await ctx.db
        .select({
          session: liveSessions,
          creatorName: creatorProfiles.displayName,
          creatorId: creatorProfiles.id,
        })
        .from(liveSessions)
        .innerJoin(creatorProfiles, eq(creatorProfiles.id, liveSessions.creatorId))
        .where(and(...conds))
        .orderBy(desc(liveSessions.scheduledAt))
        .limit(limit);
      // Also reap any rows still flagged scheduled/live but past grace —
      // listPast is a natural place to lazily catch them, since without this
      // cleanup elapsed sessions linger until the next listUpcoming call.
      const elapsedConds = [
        or(eq(liveSessions.status, "scheduled"), eq(liveSessions.status, "live"))!,
        lt(
          sql`${liveSessions.scheduledAt} + (coalesce(${liveSessions.durationMinutes}, 60) + ${ENDED_GRACE_MINUTES}) * interval '1 minute'`,
          new Date(),
        ),
      ];
      if (input?.classroomId) {
        elapsedConds.push(eq(liveSessions.classroomId, input.classroomId));
      }
      const elapsed = await ctx.db
        .select()
        .from(liveSessions)
        .where(and(...elapsedConds));
      if (elapsed.length > 0) {
        await reapElapsed(ctx.db, elapsed);
        // Re-fetch to include the freshly-flipped rows.
        const refreshed = await ctx.db
          .select({
            session: liveSessions,
            creatorName: creatorProfiles.displayName,
          })
          .from(liveSessions)
          .innerJoin(creatorProfiles, eq(creatorProfiles.id, liveSessions.creatorId))
          .where(and(...conds))
          .orderBy(desc(liveSessions.scheduledAt))
          .limit(limit);
        return refreshed.map((r) => ({ ...r.session, creatorName: r.creatorName }));
      }
      return rows.map((r) => ({ ...r.session, creatorName: r.creatorName }));
    }),

  byId: protectedProcedure.input(liveSessionIdInputSchema).query(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
    const { session, isHost } = await requireSessionAccess(ctx.db, input.sessionId, ctx.userId);
    const reaped = await autoEndIfElapsed(ctx.db, session);
    const [counts] = await ctx.db
      .select({
        attendeeCount: sql<number>`count(*)::int`,
      })
      .from(liveSessionAttendees)
      .where(eq(liveSessionAttendees.sessionId, input.sessionId));
    const [creator] = await ctx.db
      .select({ id: creatorProfiles.id, displayName: creatorProfiles.displayName })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, reaped.creatorId))
      .limit(1);
    // Did the caller already mark joined? Lets the UI flip the button label
    // from "Join" → "Re-open" without a second round trip.
    const [myAttendance] = await ctx.db
      .select()
      .from(liveSessionAttendees)
      .where(
        and(
          eq(liveSessionAttendees.sessionId, input.sessionId),
          eq(liveSessionAttendees.userId, ctx.userId),
        ),
      )
      .limit(1);
    return {
      session: reaped,
      creator: creator ?? null,
      attendeeCount: counts?.attendeeCount ?? 0,
      isHost,
      myAttendance: myAttendance ?? null,
    };
  }),

  // ─── Student attendance ────────────────────────────────

  /**
   * Idempotent: re-clicking Join on a session the student already attends
   * just refreshes joined_at and clears any prior left_at. First join also
   * flips status `scheduled` → `live` on the session itself.
   */
  markJoined: protectedProcedure
    .input(liveSessionIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
      const { session } = await requireSessionAccess(ctx.db, input.sessionId, ctx.userId);
      if (session.status === "cancelled" || session.status === "ended") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This session is no longer joinable",
        });
      }
      // Don't let students join paid sessions for free — this slice has no
      // checkout flow, so paid sessions are listed but the join is blocked.
      if (!session.isFree) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Paid live-session checkout is not yet implemented",
        });
      }
      // 5-minute pre-start window — server-side guard mirroring the UI.
      const fiveMinBefore = new Date(session.scheduledAt.getTime() - 5 * 60_000);
      if (Date.now() < fiveMinBefore.getTime()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Session is not open for joining yet (opens 5 min before start)",
        });
      }

      const now = new Date();
      await ctx.db
        .insert(liveSessionAttendees)
        .values({ sessionId: input.sessionId, userId: ctx.userId, joinedAt: now })
        .onConflictDoUpdate({
          target: [liveSessionAttendees.sessionId, liveSessionAttendees.userId],
          set: { joinedAt: now, leftAt: null },
        });

      // First-attendee transition: scheduled → live.
      if (session.status === "scheduled") {
        await ctx.db
          .update(liveSessions)
          .set({ status: "live", startedAt: session.startedAt ?? now })
          .where(eq(liveSessions.id, input.sessionId));
      }

      return { success: true as const, meetingUrl: session.meetingUrl };
    }),

  markLeft: protectedProcedure.input(markLeftSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
    await requireSessionAccess(ctx.db, input.sessionId, ctx.userId);
    const now = new Date();
    const updated = await ctx.db
      .update(liveSessionAttendees)
      .set({ leftAt: now, watchSeconds: input.watchSeconds })
      .where(
        and(
          eq(liveSessionAttendees.sessionId, input.sessionId),
          eq(liveSessionAttendees.userId, ctx.userId),
        ),
      )
      .returning({ id: liveSessionAttendees.id });
    if (updated.length === 0) {
      // Caller never markJoined — still record the attendance for analytics.
      await ctx.db.insert(liveSessionAttendees).values({
        sessionId: input.sessionId,
        userId: ctx.userId,
        joinedAt: now,
        leftAt: now,
        watchSeconds: input.watchSeconds,
      });
    }
    // Roll up watch minutes on the session for quick analytics.
    const [agg] = await ctx.db
      .select({
        total: sql<number>`coalesce(sum(${liveSessionAttendees.watchSeconds}), 0)::int`,
      })
      .from(liveSessionAttendees)
      .where(eq(liveSessionAttendees.sessionId, input.sessionId));
    await ctx.db
      .update(liveSessions)
      .set({ totalWatchMinutes: Math.floor((agg?.total ?? 0) / 60) })
      .where(eq(liveSessions.id, input.sessionId));
    return { success: true as const };
  }),

  /** Attendee roster for the host. */
  listAttendees: protectedProcedure
    .input(liveSessionIdInputSchema)
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
      await requireSessionOwner(ctx.db, input.sessionId, ctx.userId);
      return ctx.db
        .select({
          id: liveSessionAttendees.id,
          userId: liveSessionAttendees.userId,
          studentName: users.name,
          studentEmail: users.email,
          joinedAt: liveSessionAttendees.joinedAt,
          leftAt: liveSessionAttendees.leftAt,
          watchSeconds: liveSessionAttendees.watchSeconds,
        })
        .from(liveSessionAttendees)
        .innerJoin(users, eq(users.id, liveSessionAttendees.userId))
        .where(eq(liveSessionAttendees.sessionId, input.sessionId))
        .orderBy(asc(liveSessionAttendees.joinedAt));
    }),

  // ─── Backwards-compatible alias for the original stub ──

  upcoming: protectedProcedure
    .input(listLiveSessionsInputSchema.optional())
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
      const conds = [
        eq(liveSessions.status, "scheduled"),
        gte(liveSessions.scheduledAt, new Date()),
      ];
      if (input?.classroomId) {
        conds.push(eq(liveSessions.classroomId, input.classroomId));
      }
      return ctx.db
        .select()
        .from(liveSessions)
        .where(and(...conds))
        .orderBy(asc(liveSessions.scheduledAt))
        .limit(input?.limit ?? 10);
    }),
});
