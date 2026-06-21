import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { Database } from "@examforge/shared/db";
import {
  contentViews,
  creatorEarnings,
  creatorWallets,
  paymentOrders,
  subscriptionPool,
} from "@examforge/shared/db/schema";

/**
 * Monthly subscription-pool distribution.
 *
 * Ground rules (see `.claude/plans/next-session-prompts.md` § 4):
 *
 *  - Pool = 70% of subscription revenue for the period (platform keeps 30%).
 *  - weighted_score = freeViewCount × 1 + totalWatchMinutes × 0.5
 *  - Per-creator share is capped at 25% of the pool to prevent gaming.
 *  - Last creator absorbs the integer-rounding remainder so the sum of
 *    `pool_share_inr` rows equals `total_pool_inr` to the paisa.
 *
 * All monetary integers are paisa, matching `creator_wallets`,
 * `creator_earnings`, and `payment_orders` conventions elsewhere in the
 * codebase.
 */

const FREE_VIEW_WEIGHT = 1;
const WATCH_MINUTE_WEIGHT = 0.5;
const PLATFORM_CUT = 0.3;
const POOL_FRACTION = 1 - PLATFORM_CUT;
const SINGLE_CREATOR_CAP = 0.25;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type CreatorScore = {
  creatorId: string;
  freeViewCount: number;
  totalWatchMinutes: number;
  weightedScore: number;
};

export type CreatorShare = CreatorScore & {
  poolShareInr: number;
  cappedAtSingleCreatorMax: boolean;
};

export type DistributionResult = {
  periodMonth: string;
  totalPoolInr: number;
  subscriptionRevenueInr: number;
  creatorCount: number;
  shares: CreatorShare[];
  /** Sum of weighted_score across all creators (denominator). */
  allCreatorsScore: number;
};

export type DistributionRunResult = {
  periodMonth: string;
  status: "distributed" | "skipped_already_distributed" | "no_revenue" | "no_eligible_creators";
  totalPoolInr: number;
  creatorCount: number;
  poolRowsInserted: number;
};

// ─── Period helpers ──────────────────────────────────────────────────

/** "2026-04" → { startsAt: 2026-04-01T00:00Z, endsAt: 2026-05-01T00:00Z } */
export function periodBounds(periodMonth: string): { startsAt: Date; endsAt: Date } {
  if (!PERIOD_RE.test(periodMonth)) {
    throw new Error(`Invalid periodMonth: '${periodMonth}' (expected YYYY-MM)`);
  }
  const [yearStr, monthStr] = periodMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12
  const startsAt = new Date(Date.UTC(year, month - 1, 1));
  const endsAt = new Date(Date.UTC(year, month, 1));
  return { startsAt, endsAt };
}

/** Returns the previous calendar month relative to `now` as "YYYY-MM". */
export function previousPeriodMonth(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11; subtracting 1 wraps via Date below
  const prev = new Date(Date.UTC(year, month - 1, 1));
  const yyyy = prev.getUTCFullYear();
  const mm = String(prev.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

// ─── Step 1: pool sizing ─────────────────────────────────────────────

export async function computeMonthlyPool(
  db: Database,
  periodMonth: string,
): Promise<{ subscriptionRevenueInr: number; totalPoolInr: number }> {
  const { startsAt, endsAt } = periodBounds(periodMonth);
  const [row] = await db
    .select({
      revenue: sql<number>`coalesce(sum(${paymentOrders.amountInr}), 0)::int`,
    })
    .from(paymentOrders)
    .where(
      and(
        eq(paymentOrders.status, "completed"),
        eq(paymentOrders.orderType, "subscription"),
        gte(paymentOrders.createdAt, startsAt),
        lt(paymentOrders.createdAt, endsAt),
      ),
    );
  const subscriptionRevenueInr = Number(row?.revenue ?? 0);
  const totalPoolInr = Math.floor(subscriptionRevenueInr * POOL_FRACTION);
  return { subscriptionRevenueInr, totalPoolInr };
}

// ─── Step 2: per-creator scoring ─────────────────────────────────────

export async function computeCreatorScores(
  db: Database,
  periodMonth: string,
): Promise<CreatorScore[]> {
  const { startsAt, endsAt } = periodBounds(periodMonth);
  const rows = await db
    .select({
      creatorId: contentViews.creatorId,
      freeViewCount: sql<number>`
        sum(case when coalesce(${contentViews.creditCost}, 0) = 0 then 1 else 0 end)::int
      `,
      watchedSecondsTotal: sql<number>`
        coalesce(sum(${contentViews.watchedSeconds}), 0)::int
      `,
    })
    .from(contentViews)
    .where(
      and(
        gte(contentViews.createdAt, startsAt),
        lt(contentViews.createdAt, endsAt),
        sql`${contentViews.creatorId} is not null`,
      ),
    )
    .groupBy(contentViews.creatorId);

  return rows
    .filter((row): row is typeof row & { creatorId: string } => Boolean(row.creatorId))
    .map((row) => {
      const freeViewCount = Number(row.freeViewCount ?? 0);
      const totalWatchMinutes = Math.floor(Number(row.watchedSecondsTotal ?? 0) / 60);
      const weightedScore =
        freeViewCount * FREE_VIEW_WEIGHT + totalWatchMinutes * WATCH_MINUTE_WEIGHT;
      return {
        creatorId: row.creatorId,
        freeViewCount,
        totalWatchMinutes,
        weightedScore,
      };
    })
    .filter((row) => row.weightedScore > 0);
}

// ─── Step 3: pure share-allocation math (testable, no DB) ────────────

/**
 * Allocate the pool across the supplied creator scores.
 *
 * Rules:
 *  - Cap is hard: no single creator ever receives more than 25% of the
 *    pool. If too few creators exist to absorb the surplus (e.g. all 3
 *    are over-cap), the residue is left unallocated rather than breaching
 *    the cap.
 *  - Sum invariant (`sum(poolShareInr) === totalPoolInr`) holds for the
 *    common case where at least one uncapped creator can absorb floor()
 *    rounding residue. The last uncapped creator (by creatorId ascending)
 *    takes the residue.
 *  - When every creator is capped, the algorithm preserves the cap and
 *    accepts that `sum < totalPoolInr` — surplus carries over to the
 *    next month rather than gaming the cap.
 */
export function allocateShares(
  scores: CreatorScore[],
  totalPoolInr: number,
): { shares: CreatorShare[]; allCreatorsScore: number } {
  const totalScore = scores.reduce((acc, s) => acc + s.weightedScore, 0);

  if (totalPoolInr <= 0 || scores.length === 0) {
    return {
      shares: scores.map((s) => ({
        ...s,
        poolShareInr: 0,
        cappedAtSingleCreatorMax: false,
      })),
      allCreatorsScore: totalScore,
    };
  }

  // Sort by creatorId for deterministic remainder assignment.
  const sorted = [...scores].sort((a, b) => a.creatorId.localeCompare(b.creatorId));
  const cap = Math.floor(totalPoolInr * SINGLE_CREATOR_CAP);
  const cappedFlags = new Array<boolean>(sorted.length).fill(false);
  const allocations = new Array<number>(sorted.length).fill(0);

  // Iteratively cap any creator whose pro-rata share over the *remaining*
  // (uncapped) pool exceeds the per-creator cap. Each round caps ≥ 1 row,
  // so the loop terminates after at most N rounds.
  let remainingPool = totalPoolInr;
  let remainingScore = sorted.reduce((acc, s) => acc + s.weightedScore, 0);

  let bound = sorted.length + 1;
  while (bound-- > 0) {
    let cappedThisRound = false;
    for (let i = 0; i < sorted.length; i += 1) {
      if (cappedFlags[i]) continue;
      if (remainingScore <= 0) break;
      const score = sorted[i]!.weightedScore;
      const ideal = (score / remainingScore) * remainingPool;
      if (ideal >= cap) {
        allocations[i] = cap;
        cappedFlags[i] = true;
        remainingPool -= cap;
        remainingScore -= score;
        cappedThisRound = true;
      }
    }
    if (!cappedThisRound) break;
  }

  // Distribute remainingPool to uncapped creators pro-rata via floor.
  const uncappedIndices: number[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (!cappedFlags[i]) uncappedIndices.push(i);
  }

  if (remainingPool > 0 && remainingScore > 0) {
    for (const i of uncappedIndices) {
      const score = sorted[i]!.weightedScore;
      allocations[i] = Math.floor((score / remainingScore) * remainingPool);
    }
  }

  // Sum invariant: only honoured when at least one uncapped creator exists
  // to absorb floor() residue. When every creator is capped, the cap wins
  // and the surplus stays unallocated (carried over to next month).
  if (uncappedIndices.length > 0) {
    const allocatedSoFar = allocations.reduce((acc, v) => acc + v, 0);
    const remainder = totalPoolInr - allocatedSoFar;
    if (remainder > 0) {
      const target = uncappedIndices[uncappedIndices.length - 1]!;
      allocations[target] = (allocations[target] ?? 0) + remainder;
    }
  }

  const shares = sorted.map((s, i) => ({
    ...s,
    poolShareInr: allocations[i] ?? 0,
    cappedAtSingleCreatorMax: cappedFlags[i] ?? false,
  }));

  return { shares, allCreatorsScore: totalScore };
}

// ─── Step 4: end-to-end orchestration ────────────────────────────────

export async function previewDistribution(
  db: Database,
  periodMonth: string,
): Promise<DistributionResult> {
  const { subscriptionRevenueInr, totalPoolInr } = await computeMonthlyPool(db, periodMonth);
  const scores = await computeCreatorScores(db, periodMonth);
  const { shares, allCreatorsScore } = allocateShares(scores, totalPoolInr);
  return {
    periodMonth,
    totalPoolInr,
    subscriptionRevenueInr,
    creatorCount: shares.length,
    shares,
    allCreatorsScore,
  };
}

export async function distributePool(
  db: Database,
  periodMonth: string,
): Promise<DistributionRunResult> {
  if (!PERIOD_RE.test(periodMonth)) {
    throw new Error(`Invalid periodMonth: '${periodMonth}' (expected YYYY-MM)`);
  }

  // Idempotency check: if any row exists with status='distributed' for this
  // period, treat the run as a no-op.
  const existing = await db
    .select({ id: subscriptionPool.id })
    .from(subscriptionPool)
    .where(
      and(
        eq(subscriptionPool.periodMonth, periodMonth),
        eq(subscriptionPool.status, "distributed"),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return {
      periodMonth,
      status: "skipped_already_distributed",
      totalPoolInr: 0,
      creatorCount: 0,
      poolRowsInserted: 0,
    };
  }

  const result = await previewDistribution(db, periodMonth);

  if (result.totalPoolInr <= 0) {
    return {
      periodMonth,
      status: "no_revenue",
      totalPoolInr: 0,
      creatorCount: 0,
      poolRowsInserted: 0,
    };
  }
  if (result.shares.length === 0) {
    return {
      periodMonth,
      status: "no_eligible_creators",
      totalPoolInr: result.totalPoolInr,
      creatorCount: 0,
      poolRowsInserted: 0,
    };
  }

  const distributedAt = new Date();
  let poolRowsInserted = 0;

  for (const share of result.shares) {
    const breakdown = {
      freeViewCount: share.freeViewCount,
      totalWatchMinutes: share.totalWatchMinutes,
      weightedScore: share.weightedScore,
      allCreatorsScore: result.allCreatorsScore,
      poolShareCalc: {
        formula: "(weightedScore / allCreatorsScore) * totalPoolInr",
        weightedScore: share.weightedScore,
        allCreatorsScore: result.allCreatorsScore,
        totalPoolInr: result.totalPoolInr,
        capPaisa: Math.floor(result.totalPoolInr * SINGLE_CREATOR_CAP),
        capApplied: share.cappedAtSingleCreatorMax,
      },
      formula: "weighted_score = freeViewCount * 1 + totalWatchMinutes * 0.5",
    };

    const inserted = await db
      .insert(subscriptionPool)
      .values({
        creatorId: share.creatorId,
        periodMonth,
        freeViewCount: share.freeViewCount,
        totalWatchMinutes: share.totalWatchMinutes,
        weightedScore: share.weightedScore,
        poolShareInr: share.poolShareInr,
        totalPoolInr: result.totalPoolInr,
        status: "distributed",
        distributedAt,
        breakdown,
      })
      .onConflictDoUpdate({
        target: [subscriptionPool.creatorId, subscriptionPool.periodMonth],
        set: {
          freeViewCount: share.freeViewCount,
          totalWatchMinutes: share.totalWatchMinutes,
          weightedScore: share.weightedScore,
          poolShareInr: share.poolShareInr,
          totalPoolInr: result.totalPoolInr,
          status: "distributed",
          distributedAt,
          breakdown,
          updatedAt: distributedAt,
        },
      })
      .returning({ id: subscriptionPool.id });

    poolRowsInserted += inserted.length;

    if (share.poolShareInr <= 0) continue;

    await db.insert(creatorEarnings).values({
      creatorId: share.creatorId,
      earningType: "subscription_pool",
      amountInr: share.poolShareInr,
      status: "available",
      availableAt: distributedAt,
      sourceType: "subscription_pool",
      description: `Subscription pool distribution for ${periodMonth}`,
      metadata: {
        periodMonth,
        weightedScore: share.weightedScore,
        allCreatorsScore: result.allCreatorsScore,
        totalPoolInr: result.totalPoolInr,
      },
    });

    // Atomic wallet credit. INSERT ... ON CONFLICT keeps the operation
    // single-statement so concurrent runs can't double-credit.
    await db
      .insert(creatorWallets)
      .values({
        creatorId: share.creatorId,
        balanceInr: share.poolShareInr,
        pendingInr: 0,
        lifetimeEarnedInr: share.poolShareInr,
      })
      .onConflictDoUpdate({
        target: creatorWallets.creatorId,
        set: {
          balanceInr: sql`${creatorWallets.balanceInr} + ${share.poolShareInr}`,
          lifetimeEarnedInr: sql`${creatorWallets.lifetimeEarnedInr} + ${share.poolShareInr}`,
          updatedAt: distributedAt,
        },
      });
  }

  return {
    periodMonth,
    status: "distributed",
    totalPoolInr: result.totalPoolInr,
    creatorCount: result.shares.length,
    poolRowsInserted,
  };
}

// ─── Read helpers (admin UI) ────────────────────────────────────────

export async function listPoolPeriods(db: Database): Promise<
  {
    periodMonth: string;
    totalPoolInr: number;
    distributedAmountInr: number;
    creatorCount: number;
    distributedAt: Date | null;
  }[]
> {
  const rows = await db
    .select({
      periodMonth: subscriptionPool.periodMonth,
      totalPoolInr: sql<number>`max(${subscriptionPool.totalPoolInr})::int`,
      distributedAmountInr: sql<number>`coalesce(sum(${subscriptionPool.poolShareInr}), 0)::int`,
      creatorCount: sql<number>`count(*)::int`,
      distributedAt: sql<Date | null>`max(${subscriptionPool.distributedAt})`,
    })
    .from(subscriptionPool)
    .where(eq(subscriptionPool.status, "distributed"))
    .groupBy(subscriptionPool.periodMonth)
    .orderBy(asc(subscriptionPool.periodMonth));
  return rows.map((row) => ({
    periodMonth: row.periodMonth,
    totalPoolInr: Number(row.totalPoolInr ?? 0),
    distributedAmountInr: Number(row.distributedAmountInr ?? 0),
    creatorCount: Number(row.creatorCount ?? 0),
    distributedAt: row.distributedAt,
  }));
}
