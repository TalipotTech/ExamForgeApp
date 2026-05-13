import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
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
  scheduleZoomLiveSessionSchema,
  scheduleEmbeddedLiveSessionSchema,
  liveSessionIdInputSchema,
  listLiveSessionsInputSchema,
  markLeftSchema,
  setRecordingUrlSchema,
} from "@examforge/shared/validators";
import { router, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";
import { createZoomMeeting } from "../../services/zoom-client.js";
import { createHmsRoom, isHmsConfigured } from "../../services/hms-client.js";
import { issueHmsAuthToken } from "../../services/hms-token.js";

// 30-minute grace window after scheduled end before we auto-flip a session
// to `ended`. Long enough to absorb sessions that run a little over without
// requiring creators to manually close them.
const ENDED_GRACE_MINUTES = 30;

/**
 * Postgres "current time" expressed as a `timestamp WITHOUT time zone` in
 * UTC wall-clock. Use THIS — not `new Date()` — anywhere we compare against
 * a `scheduled_at` column.
 *
 * Why: drizzle stores Date values in `timestamp without time zone` columns
 * by serializing the JS Date as UTC ISO. But pg-node serializes a *bound*
 * Date parameter using the Node process's local timezone, which means
 * `new Date()` arrives at PG as e.g. "2026-05-08 21:42 IST" stripped to
 * a TZ-less wall-clock — while stored values arrive as the UTC wall-clock
 * "2026-05-08 16:30". Comparing the two mixes timezones and silently
 * misclassifies sessions as past-when-they're-future (or vice versa).
 *
 * `now() AT TIME ZONE 'UTC'` returns the current moment as a TZ-less
 * UTC wall-clock, matching how the column was populated.
 */
const NOW_UTC = sql`(now() AT TIME ZONE 'UTC')`;

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

/**
 * Build the WHERE predicate that scopes a session list to what the caller
 * can legitimately see:
 *   - standalone sessions (classroom_id IS NULL) — public to all signed-in users
 *   - sessions in classrooms where caller is an active member
 *   - sessions hosted by caller (creator)
 *
 * If `requireClassroomId` is set, the caller must additionally be a member
 * (or host) of THAT classroom — prevents querying a classroom you don't
 * belong to by guessing its UUID.
 */
async function buildAccessScope(
  db: Database,
  userId: string,
  requireClassroomId?: string,
): Promise<ReturnType<typeof or> | null> {
  // Caller's active classroom memberships
  const memberships = await db
    .select({ classroomId: classroomMembers.classroomId })
    .from(classroomMembers)
    .where(and(eq(classroomMembers.studentId, userId), eq(classroomMembers.status, "active")));
  const memberClassroomIds = memberships.map((m) => m.classroomId);

  // Caller's creator profile (if any) — host can see their own sessions.
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);

  if (requireClassroomId) {
    // Locked to one classroom — must be host of session OR member of that classroom.
    const isMember = memberClassroomIds.includes(requireClassroomId);
    const isHostOfClassroom = profile
      ? or(eq(liveSessions.creatorId, profile.id), eq(liveSessions.classroomId, requireClassroomId))
      : eq(liveSessions.classroomId, requireClassroomId);
    if (!isMember && !profile) {
      // Neither member nor a creator — explicitly empty result. Build a
      // contradiction so drizzle returns 0 rows without throwing.
      return sql`false`;
    }
    return isMember ? eq(liveSessions.classroomId, requireClassroomId) : isHostOfClassroom;
  }

  // Open scope — public + member-of + own
  const branches: ReturnType<typeof or>[] = [isNull(liveSessions.classroomId)];
  if (memberClassroomIds.length > 0) {
    branches.push(inArray(liveSessions.classroomId, memberClassroomIds));
  }
  if (profile) {
    branches.push(eq(liveSessions.creatorId, profile.id));
  }
  return or(...branches);
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
        meetingProvider: "manual",
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

  /**
   * Same as `schedule` but auto-creates the meeting in the creator's
   * connected Zoom account. We persist the resulting `join_url` and
   * Zoom meeting `id` (latter lets the webhook attach the recording back
   * to the right row when Zoom processes it later).
   */
  scheduleViaZoom: protectedProcedure
    .input(scheduleZoomLiveSessionSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
      const profile = await requireCreatorProfile(ctx.db, ctx.userId);

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

      let meeting: Awaited<ReturnType<typeof createZoomMeeting>>;
      try {
        meeting = await createZoomMeeting(ctx.db, profile.id, {
          title: input.title,
          description: input.description,
          scheduledAt: input.scheduledAt,
          durationMinutes: input.durationMinutes,
          autoRecord: input.autoRecord,
          muteOnEntry: input.muteOnEntry,
          waitingRoom: input.waitingRoom,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("ZOOM_NOT_CONNECTED")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Connect Zoom in /creator/integrations before scheduling via Zoom.",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create Zoom meeting: ${msg}`,
        });
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
          meetingProvider: "zoom",
          meetingUrl: meeting.join_url,
          meetingId: meeting.id,
          isRecorded: input.autoRecord,
          subject: input.subject,
          topic: input.topic,
          isFree: input.isFree,
          priceInr: input.priceInr,
          status: "scheduled",
        })
        .returning({ id: liveSessions.id });
      if (!row) throw new Error("Failed to create live session");
      return { id: row.id, meetingUrl: meeting.join_url };
    }),

  /**
   * Option C — embedded video via 100ms. Creates a 100ms room scoped to
   * this session, persists the room id so getJoinToken / the recording
   * webhook can find it. The "meeting url" we store is our internal
   * /dashboard/live/[id]/room route — students never leave ExamForge.
   */
  scheduleEmbedded: protectedProcedure
    .input(scheduleEmbeddedLiveSessionSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
      if (!isHmsConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Embedded video is not configured on this server",
        });
      }
      const profile = await requireCreatorProfile(ctx.db, ctx.userId);

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

      // Use the recording template if the creator opted in AND it's set;
      // otherwise stick with the default template.
      const recordingTemplate = process.env.HMS_RECORDING_TEMPLATE_ID;
      const templateOverride =
        input.enableRecording && recordingTemplate ? recordingTemplate : undefined;

      let room: Awaited<ReturnType<typeof createHmsRoom>>;
      try {
        room = await createHmsRoom({
          name: `${input.title}-${Date.now()}`,
          description: input.description,
          templateId: templateOverride,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create 100ms room: ${msg}`,
        });
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
          meetingType: "embedded",
          meetingProvider: "100ms",
          // meetingUrl is the in-app room path — students stay on ExamForge.
          // We don't know `id` until after insert, so we patch it after.
          meetingUrl: null,
          meetingId: room.id,
          providerRoomId: room.id,
          providerTemplateId: room.template_id,
          isRecorded: input.enableRecording,
          maxAttendees: input.maxAttendees,
          subject: input.subject,
          topic: input.topic,
          isFree: input.isFree,
          priceInr: input.priceInr,
          status: "scheduled",
        })
        .returning({ id: liveSessions.id });
      if (!row) throw new Error("Failed to create live session");
      const inAppUrl = `/dashboard/live/${row.id}/room`;
      await ctx.db
        .update(liveSessions)
        .set({ meetingUrl: inAppUrl })
        .where(eq(liveSessions.id, row.id));
      return { id: row.id, meetingUrl: inAppUrl };
    }),

  /**
   * Issues a 100ms auth token scoped to the calling user + this session's
   * room. Mutation (not query) because handing out a credential should
   * never be cached. Caller must pass auth + classroom-membership checks.
   */
  getJoinToken: protectedProcedure
    .input(liveSessionIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
      if (!isHmsConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Embedded video is not configured on this server",
        });
      }
      const { session, isHost } = await requireSessionAccess(ctx.db, input.sessionId, ctx.userId);
      if (session.meetingProvider !== "100ms") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This session does not use embedded video",
        });
      }
      if (!session.providerRoomId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Session has no provider_room_id — re-schedule needed",
        });
      }
      if (session.status === "ended" || session.status === "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This session is no longer joinable",
        });
      }
      // 5-min pre-start window matches the markJoined gate.
      const fiveMinBefore = new Date(session.scheduledAt.getTime() - 5 * 60_000);
      if (!isHost && Date.now() < fiveMinBefore.getTime()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Session is not open for joining yet (opens 5 min before start)",
        });
      }
      const role = isHost ? "creator" : "student";
      const token = issueHmsAuthToken({
        roomId: session.providerRoomId,
        userId: ctx.userId,
        role,
      });

      // Auto-attendance: insert (or refresh) the attendee row and flip
      // status `scheduled` → `live` on first peer through the door. Matches
      // the manual / Zoom path's `markJoined` so embedded sessions don't
      // get stuck on the "Scheduled" badge while a meeting is in progress.
      const now = new Date();
      await ctx.db
        .insert(liveSessionAttendees)
        .values({ sessionId: session.id, userId: ctx.userId, joinedAt: now })
        .onConflictDoUpdate({
          target: [liveSessionAttendees.sessionId, liveSessionAttendees.userId],
          set: { joinedAt: now, leftAt: null },
        });
      if (session.status === "scheduled") {
        await ctx.db
          .update(liveSessions)
          .set({ status: "live", startedAt: session.startedAt ?? now })
          .where(eq(liveSessions.id, session.id));
      }

      return { token, role };
    }),

  /** Lightweight feature-detect query — UI uses this to decide whether to
   *  show the "Embedded HD video" radio. Returns just a boolean; never
   *  leaks env values. */
  embeddedConfigured: protectedProcedure.query(async ({ ctx }) => {
    await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
    return { configured: isHmsConfigured() };
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

  /** Upcoming = scheduled, end-time still in the future. Without a
   *  classroomId filter the result is scoped to: standalone (public) +
   *  member-of + caller-hosted, so we don't leak titles of other classrooms.
   *  With a classroomId, membership is enforced. */
  listUpcoming: protectedProcedure
    .input(listLiveSessionsInputSchema.optional())
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
      const limit = input?.limit ?? 50;
      const scope = await buildAccessScope(ctx.db, ctx.userId, input?.classroomId);
      const conds = [
        or(eq(liveSessions.status, "scheduled"), eq(liveSessions.status, "live"))!,
        // end-time = scheduled + duration + grace; we want sessions whose end
        // hasn't passed yet so a session that started 10 min ago still shows.
        gte(
          sql`${liveSessions.scheduledAt} + (coalesce(${liveSessions.durationMinutes}, 60) + ${ENDED_GRACE_MINUTES}) * interval '1 minute'`,
          NOW_UTC,
        ),
      ];
      if (scope) conds.push(scope);
      if (input?.classroomId) {
        conds.push(eq(liveSessions.classroomId, input.classroomId));
      }
      // LEFT JOIN (not INNER) so a session whose creator_profile was deleted
      // / mis-FK'd still surfaces — defensive: a missing display name renders
      // as "(unknown creator)" rather than the row vanishing entirely.
      const rows = await ctx.db
        .select({
          session: liveSessions,
          creatorName: creatorProfiles.displayName,
          creatorId: creatorProfiles.id,
        })
        .from(liveSessions)
        .leftJoin(creatorProfiles, eq(creatorProfiles.id, liveSessions.creatorId))
        .where(and(...conds))
        .orderBy(asc(liveSessions.scheduledAt))
        .limit(limit);
      // Reap any rows whose grace window has now passed (race against TZ skew).
      const reaped = await reapElapsed(
        ctx.db,
        rows.map((r) => r.session),
      );
      return rows
        .map((r, i) => ({
          ...r.session,
          ...reaped[i],
          creatorName: r.creatorName ?? "(unknown creator)",
        }))
        .filter((r) => r.status === "scheduled" || r.status === "live");
    }),

  /** Past sessions for the caller — ended OR cancelled. Same access scope
   *  rules as listUpcoming. Recording link surfaces here for replays. */
  listPast: protectedProcedure
    .input(listLiveSessionsInputSchema.optional())
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
      const limit = input?.limit ?? 50;
      const scope = await buildAccessScope(ctx.db, ctx.userId, input?.classroomId);
      const conds = [or(eq(liveSessions.status, "ended"), eq(liveSessions.status, "cancelled"))!];
      if (scope) conds.push(scope);
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
        .leftJoin(creatorProfiles, eq(creatorProfiles.id, liveSessions.creatorId))
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
          NOW_UTC,
        ),
      ];
      if (scope) elapsedConds.push(scope);
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
          .leftJoin(creatorProfiles, eq(creatorProfiles.id, liveSessions.creatorId))
          .where(and(...conds))
          .orderBy(desc(liveSessions.scheduledAt))
          .limit(limit);
        return refreshed.map((r) => ({
          ...r.session,
          creatorName: r.creatorName ?? "(unknown creator)",
        }));
      }
      return rows.map((r) => ({
        ...r.session,
        creatorName: r.creatorName ?? "(unknown creator)",
      }));
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
      const conds = [eq(liveSessions.status, "scheduled"), gte(liveSessions.scheduledAt, NOW_UTC)];
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
