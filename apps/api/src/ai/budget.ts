import { sql } from "drizzle-orm";
import { aiUsageLogs } from "@examforge/shared/db/schema";
import type { Database } from "@examforge/shared/db";

export async function checkBudget(db: Database): Promise<{
  allowed: boolean;
  usedUsd: number;
  budgetUsd: number;
  remainingUsd: number;
}> {
  const budgetUsd = Number(process.env.AI_MONTHLY_BUDGET_USD) || 100;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const result = await db
    .select({
      totalCost: sql<number>`COALESCE(SUM(${aiUsageLogs.estimatedCostUsd}), 0)`,
    })
    .from(aiUsageLogs)
    .where(sql`${aiUsageLogs.createdAt} >= ${monthStart.toISOString()}`);

  const usedUsd = Number(result[0]?.totalCost ?? 0);

  return {
    allowed: usedUsd < budgetUsd,
    usedUsd,
    budgetUsd,
    remainingUsd: Math.max(0, budgetUsd - usedUsd),
  };
}
