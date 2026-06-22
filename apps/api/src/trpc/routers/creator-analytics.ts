import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@examforge/shared/db";
import {
  classroomMembers,
  classrooms,
  contentViews,
  creatorContent,
  creatorEarnings,
  creatorFollowers,
  creatorProfiles,
  creatorWallets,
  doubtResponses,
  doubts,
} from "@examforge/shared/db/schema";
import { router, protectedProcedure } from "../trpc.js";

async function requireCreatorProfile(db: Database, userId: string): Promise<{ id: string }> {
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);
  if (!profile) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not a registered creator",
    });
  }
  return profile;
}

const daysSchema = z.object({
  days: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(30),
});

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export const creatorAnalyticsRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const profile = await requireCreatorProfile(ctx.db, ctx.userId);
    const [profileRow] = await ctx.db
      .select({
        followerCount: creatorProfiles.followerCount,
        contentCount: creatorProfiles.contentCount,
        totalViews: creatorProfiles.totalViews,
        totalStudents: creatorProfiles.totalStudents,
        totalSales: creatorProfiles.totalSales,
        totalRevenueEarned: creatorProfiles.totalRevenueEarned,
        averageRating: creatorProfiles.averageRating,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profile.id))
      .limit(1);

    const [wallet] = await ctx.db
      .select({
        balanceInr: creatorWallets.balanceInr,
        pendingInr: creatorWallets.pendingInr,
        lifetimeEarnedInr: creatorWallets.lifetimeEarnedInr,
      })
      .from(creatorWallets)
      .where(eq(creatorWallets.creatorId, profile.id))
      .limit(1);

    const since = daysAgo(30);

    const [followersDelta] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(creatorFollowers)
      .where(
        and(eq(creatorFollowers.creatorId, profile.id), gte(creatorFollowers.followedAt, since)),
      );

    const [pendingEarnings] = await ctx.db
      .select({
        amount: sql<number>`coalesce(sum(${creatorEarnings.amountInr}), 0)::int`,
      })
      .from(creatorEarnings)
      .where(and(eq(creatorEarnings.creatorId, profile.id), eq(creatorEarnings.status, "pending")));

    return {
      followerCount: profileRow?.followerCount ?? 0,
      contentCount: profileRow?.contentCount ?? 0,
      totalViews: profileRow?.totalViews ?? 0,
      totalStudents: profileRow?.totalStudents ?? 0,
      totalSales: profileRow?.totalSales ?? 0,
      totalRevenueEarned: profileRow?.totalRevenueEarned ?? 0,
      averageRating: profileRow?.averageRating ?? 0,
      walletBalanceInr: wallet?.balanceInr ?? 0,
      walletPendingInr: wallet?.pendingInr ?? 0,
      lifetimeEarnedInr: wallet?.lifetimeEarnedInr ?? 0,
      pendingEarningsInr: pendingEarnings?.amount ?? 0,
      followerDelta30d: followersDelta?.count ?? 0,
    };
  }),

  revenueByDay: protectedProcedure.input(daysSchema).query(async ({ ctx, input }) => {
    const profile = await requireCreatorProfile(ctx.db, ctx.userId);
    const since = daysAgo(input.days);

    const rows = await ctx.db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${creatorEarnings.createdAt}), 'YYYY-MM-DD')`,
        amount: sql<number>`coalesce(sum(${creatorEarnings.amountInr}), 0)::int`,
      })
      .from(creatorEarnings)
      .where(and(eq(creatorEarnings.creatorId, profile.id), gte(creatorEarnings.createdAt, since)))
      .groupBy(sql`date_trunc('day', ${creatorEarnings.createdAt})`)
      .orderBy(sql`date_trunc('day', ${creatorEarnings.createdAt})`);

    return rows.map((row) => ({
      date: row.day,
      amount: Number(row.amount ?? 0),
    }));
  }),

  viewsByDay: protectedProcedure.input(daysSchema).query(async ({ ctx, input }) => {
    const profile = await requireCreatorProfile(ctx.db, ctx.userId);
    const since = daysAgo(input.days);

    const rows = await ctx.db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${contentViews.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(contentViews)
      .where(and(eq(contentViews.creatorId, profile.id), gte(contentViews.createdAt, since)))
      .groupBy(sql`date_trunc('day', ${contentViews.createdAt})`)
      .orderBy(sql`date_trunc('day', ${contentViews.createdAt})`);

    return rows.map((row) => ({
      date: row.day,
      count: Number(row.count ?? 0),
    }));
  }),

  topContent: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }).optional())
    .query(async ({ ctx, input }) => {
      const profile = await requireCreatorProfile(ctx.db, ctx.userId);
      const limit = input?.limit ?? 10;
      const rows = await ctx.db
        .select({
          id: creatorContent.id,
          title: creatorContent.title,
          contentType: creatorContent.contentType,
          isPublished: creatorContent.isPublished,
          isPremium: creatorContent.isPremium,
          viewCount: creatorContent.viewCount,
          likeCount: creatorContent.likeCount,
          doubtCount: creatorContent.doubtCount,
          totalWatchMinutes: creatorContent.totalWatchMinutes,
          avgRating: creatorContent.avgRating,
          createdAt: creatorContent.createdAt,
        })
        .from(creatorContent)
        .where(eq(creatorContent.creatorId, profile.id))
        .orderBy(desc(creatorContent.viewCount))
        .limit(limit);
      return rows;
    }),

  classroomEnrollment: protectedProcedure.query(async ({ ctx }) => {
    const profile = await requireCreatorProfile(ctx.db, ctx.userId);
    const since = daysAgo(30);

    const rows = await ctx.db
      .select({
        classroomId: classrooms.id,
        name: classrooms.name,
        studentCount: classrooms.studentCount,
        isActive: classrooms.isActive,
        isPaid: classrooms.isPaid,
        createdAt: classrooms.createdAt,
        joinedLast30: sql<number>`(
          select count(*)::int
          from ${classroomMembers}
          where ${classroomMembers.classroomId} = ${classrooms.id}
            and ${classroomMembers.joinedAt} >= ${since}
        )`,
      })
      .from(classrooms)
      .where(eq(classrooms.creatorId, profile.id))
      .orderBy(desc(classrooms.createdAt));

    return rows.map((row) => ({
      ...row,
      joinedLast30: Number(row.joinedLast30 ?? 0),
    }));
  }),

  doubtStats: protectedProcedure.query(async ({ ctx }) => {
    const profile = await requireCreatorProfile(ctx.db, ctx.userId);

    // doubts.creatorId references users.id (NOT creator_profiles.id), so we
    // pivot via creator_content for content-attached doubts plus a direct
    // user-level lookup for direct doubts.
    const [profileUser] = await ctx.db
      .select({ userId: creatorProfiles.userId })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profile.id))
      .limit(1);
    const userId = profileUser?.userId;

    const statusCondition = userId
      ? sql`(
          ${doubts.creatorId} = ${userId}
          or ${doubts.contentId} in (
            select ${creatorContent.id}
            from ${creatorContent}
            where ${creatorContent.creatorId} = ${profile.id}
          )
        )`
      : sql`${doubts.contentId} in (
          select ${creatorContent.id}
          from ${creatorContent}
          where ${creatorContent.creatorId} = ${profile.id}
        )`;

    const statusRows = await ctx.db
      .select({
        status: doubts.status,
        count: sql<number>`count(*)::int`,
      })
      .from(doubts)
      .where(statusCondition)
      .groupBy(doubts.status);

    const counts = { open: 0, answered: 0, closed: 0 } as Record<string, number>;
    for (const row of statusRows) {
      counts[row.status] = Number(row.count ?? 0);
    }
    const total = (counts.open ?? 0) + (counts.answered ?? 0) + (counts.closed ?? 0);
    const answered = (counts.answered ?? 0) + (counts.closed ?? 0);
    const responseRate = total > 0 ? answered / total : 0;

    // Median-ish response time (avg first response in hours) — only doubts
    // that actually got a non-AI response from the creator's user account.
    let avgResponseHours: number | null = null;
    if (userId) {
      const [responseAvg] = await ctx.db
        .select({
          avgHours: sql<number | null>`
            avg(extract(epoch from (${doubtResponses.createdAt} - ${doubts.createdAt})) / 3600)
          `,
        })
        .from(doubtResponses)
        .innerJoin(doubts, eq(doubts.id, doubtResponses.doubtId))
        .where(and(eq(doubtResponses.responderId, userId), eq(doubtResponses.isAi, false)));
      avgResponseHours = responseAvg?.avgHours != null ? Number(responseAvg.avgHours) : null;
    }

    return {
      open: counts.open ?? 0,
      answered: counts.answered ?? 0,
      closed: counts.closed ?? 0,
      total,
      responseRate,
      avgResponseHours,
    };
  }),
});
