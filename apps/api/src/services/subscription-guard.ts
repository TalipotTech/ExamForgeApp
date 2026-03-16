import { eq, and, gte, lte } from "drizzle-orm";
import { userCredits, userSubscriptions, subscriptionPlans } from "@examforge/shared/db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

const FREE_TIER_MAX_EXAMS = 3;

export type ExamQuotaResult = {
  allowed: boolean;
  used: number;
  limit: number;
  planName: string;
};

export async function checkExamQuota(
  db: NodePgDatabase<Record<string, unknown>>,
  userId: string,
): Promise<ExamQuotaResult> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]!;

  // Get current credits record
  const [credits] = await db
    .select({
      mockExamsTaken: userCredits.mockExamsTaken,
    })
    .from(userCredits)
    .where(
      and(
        eq(userCredits.userId, userId),
        lte(userCredits.periodStart, periodStart),
        gte(userCredits.periodEnd, periodStart),
      ),
    )
    .limit(1);

  const used = credits?.mockExamsTaken ?? 0;

  // Check for active subscription
  const [subscription] = await db
    .select({
      planName: subscriptionPlans.displayName,
      maxMockExams: subscriptionPlans.maxMockExams,
    })
    .from(userSubscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, userSubscriptions.planId))
    .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
    .limit(1);

  const limit = subscription?.maxMockExams ?? FREE_TIER_MAX_EXAMS;
  const planName = subscription?.planName ?? "Free";

  return {
    allowed: used < limit,
    used,
    limit,
    planName,
  };
}

export async function isUserSubscriber(
  db: NodePgDatabase<Record<string, unknown>>,
  userId: string,
): Promise<boolean> {
  const [subscription] = await db
    .select({ id: userSubscriptions.id })
    .from(userSubscriptions)
    .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
    .limit(1);

  return !!subscription;
}

export type SubscriptionInfo = {
  isSubscriber: boolean;
  planName: string | null;
  planId: string | null;
};

export async function getSubscriptionInfo(
  db: NodePgDatabase<Record<string, unknown>>,
  userId: string,
): Promise<SubscriptionInfo> {
  const [subscription] = await db
    .select({
      planId: userSubscriptions.planId,
      planName: subscriptionPlans.displayName,
    })
    .from(userSubscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, userSubscriptions.planId))
    .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
    .limit(1);

  return {
    isSubscriber: !!subscription,
    planName: subscription?.planName ?? null,
    planId: subscription?.planId ?? null,
  };
}

export async function incrementExamCount(
  db: NodePgDatabase<Record<string, unknown>>,
  userId: string,
): Promise<void> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]!;
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]!;

  // Upsert credits record
  const [existing] = await db
    .select({ id: userCredits.id, mockExamsTaken: userCredits.mockExamsTaken })
    .from(userCredits)
    .where(
      and(
        eq(userCredits.userId, userId),
        lte(userCredits.periodStart, periodStart),
        gte(userCredits.periodEnd, periodStart),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(userCredits)
      .set({
        mockExamsTaken: (existing.mockExamsTaken ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(userCredits.id, existing.id));
  } else {
    await db.insert(userCredits).values({
      userId,
      periodStart,
      periodEnd,
      creditsTotal: 0,
      mockExamsTaken: 1,
    });
  }
}
