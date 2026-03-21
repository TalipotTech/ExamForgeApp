import { eq, and, gte, sql } from "drizzle-orm";
import type { Database } from "@examforge/shared/db";
import { ttsUsageLogs } from "@examforge/shared/db/schema";
import { getFlag } from "../feature-flags.js";

export async function logTTSUsage(
  db: Database,
  params: {
    userId: string;
    provider: string;
    voiceId: string;
    charCount: number;
    estimatedCostUsd?: number;
    sessionId?: string;
  },
): Promise<void> {
  await db.insert(ttsUsageLogs).values({
    userId: params.userId,
    provider: params.provider,
    voiceId: params.voiceId,
    charCount: params.charCount,
    estimatedCostUsd: params.estimatedCostUsd ?? 0,
    sessionId: params.sessionId ?? null,
  });
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function getUserMonthlyUsage(db: Database, userId: string): Promise<number> {
  const [result] = await db
    .select({ total: sql<number>`COALESCE(SUM(${ttsUsageLogs.charCount}), 0)` })
    .from(ttsUsageLogs)
    .where(and(eq(ttsUsageLogs.userId, userId), gte(ttsUsageLogs.createdAt, startOfMonth())));
  return result?.total ?? 0;
}

export async function getPlatformMonthlyUsage(db: Database): Promise<number> {
  const [result] = await db
    .select({ total: sql<number>`COALESCE(SUM(${ttsUsageLogs.charCount}), 0)` })
    .from(ttsUsageLogs)
    .where(gte(ttsUsageLogs.createdAt, startOfMonth()));
  return result?.total ?? 0;
}

export async function canUserSynthesize(
  db: Database,
  userId: string,
  charCount: number,
): Promise<{ allowed: boolean; remaining: number; used: number; limit: number }> {
  const perUserLimit = ((await getFlag(db, "voice.per_user_char_limit")) as number) ?? 10000;
  const used = await getUserMonthlyUsage(db, userId);
  const remaining = Math.max(0, perUserLimit - used);

  return {
    allowed: used + charCount <= perUserLimit,
    remaining,
    used,
    limit: perUserLimit,
  };
}
