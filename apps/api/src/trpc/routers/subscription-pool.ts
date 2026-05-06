import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { creatorProfiles, subscriptionPool } from "@examforge/shared/db/schema";
import { router, adminProcedure } from "../trpc.js";
import { createAuditEntry } from "../../services/audit-log.js";
import {
  computeMonthlyPool,
  listPoolPeriods,
  previewDistribution,
  previousPeriodMonth,
} from "../../services/subscription-pool.js";
import { enqueueSubscriptionPoolRun } from "../../queues/subscription-pool-queue.js";

const PERIOD_SCHEMA = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
  message: "periodMonth must be YYYY-MM",
});

export const subscriptionPoolRouter = router({
  listPeriods: adminProcedure.query(async ({ ctx }) => {
    const distributed = await listPoolPeriods(ctx.db);
    return {
      previousMonth: previousPeriodMonth(),
      periods: distributed,
    };
  }),

  /** Per-creator breakdown for a single period. */
  byPeriod: adminProcedure
    .input(z.object({ periodMonth: PERIOD_SCHEMA }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: subscriptionPool.id,
          creatorId: subscriptionPool.creatorId,
          creatorDisplayName: creatorProfiles.displayName,
          freeViewCount: subscriptionPool.freeViewCount,
          totalWatchMinutes: subscriptionPool.totalWatchMinutes,
          weightedScore: subscriptionPool.weightedScore,
          poolShareInr: subscriptionPool.poolShareInr,
          totalPoolInr: subscriptionPool.totalPoolInr,
          status: subscriptionPool.status,
          distributedAt: subscriptionPool.distributedAt,
          breakdown: subscriptionPool.breakdown,
          createdAt: subscriptionPool.createdAt,
        })
        .from(subscriptionPool)
        .leftJoin(creatorProfiles, eq(creatorProfiles.id, subscriptionPool.creatorId))
        .where(eq(subscriptionPool.periodMonth, input.periodMonth))
        .orderBy(desc(subscriptionPool.poolShareInr));

      const totalPoolInr = rows[0]?.totalPoolInr ?? 0;
      const distributedAmountInr = rows.reduce((acc, row) => acc + (row.poolShareInr ?? 0), 0);

      return {
        periodMonth: input.periodMonth,
        totalPoolInr: Number(totalPoolInr),
        distributedAmountInr,
        creatorCount: rows.length,
        rows,
      };
    }),

  /**
   * Preview-only — runs the same math as `distributePool` but writes
   * nothing. Useful before pulling the trigger on a manual re-run.
   */
  preview: adminProcedure
    .input(z.object({ periodMonth: PERIOD_SCHEMA }))
    .query(async ({ ctx, input }) => {
      // Block preview for periods already distributed — they should use
      // byPeriod instead, which reflects the persisted breakdown.
      const [existing] = await ctx.db
        .select({ id: subscriptionPool.id })
        .from(subscriptionPool)
        .where(
          and(
            eq(subscriptionPool.periodMonth, input.periodMonth),
            eq(subscriptionPool.status, "distributed"),
          ),
        )
        .limit(1);
      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Period already distributed — use byPeriod for the breakdown.",
        });
      }

      const result = await previewDistribution(ctx.db, input.periodMonth);
      return result;
    }),

  /**
   * Cheap snapshot for the "Run for [previous month]" button — shows the
   * gross subscription revenue and what the pool would be without doing
   * any creator-side scoring work.
   */
  poolSummary: adminProcedure
    .input(z.object({ periodMonth: PERIOD_SCHEMA }))
    .query(async ({ ctx, input }) => {
      const { subscriptionRevenueInr, totalPoolInr } = await computeMonthlyPool(
        ctx.db,
        input.periodMonth,
      );
      return {
        periodMonth: input.periodMonth,
        subscriptionRevenueInr,
        totalPoolInr,
      };
    }),

  /** Enqueue a manual one-shot run. The worker is the executor. */
  triggerRun: adminProcedure
    .input(z.object({ periodMonth: PERIOD_SCHEMA }))
    .mutation(async ({ ctx, input }) => {
      const { jobId } = await enqueueSubscriptionPoolRun(input.periodMonth, ctx.userId);
      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "subscription_pool.trigger_run",
        targetType: "subscription_pool",
        targetId: undefined,
        details: { after: { periodMonth: input.periodMonth, jobId } },
      });
      return { success: true, jobId, periodMonth: input.periodMonth };
    }),
});
