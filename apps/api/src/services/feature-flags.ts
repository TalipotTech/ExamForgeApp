import { eq } from "drizzle-orm";
import type { Database } from "@examforge/shared/db";
import { adminFeatureFlags, adminAuditLog } from "@examforge/shared/db/schema";
import { getRedisClient } from "../lib/redis.js";

const CACHE_PREFIX = "ff:";
const CACHE_TTL = 300; // 5 minutes

export async function getFlag(db: Database, key: string): Promise<unknown> {
  const redis = getRedisClient();
  const cached = await redis.get(`${CACHE_PREFIX}${key}`);
  if (cached !== null) {
    return JSON.parse(cached);
  }

  const [flag] = await db
    .select({ value: adminFeatureFlags.value })
    .from(adminFeatureFlags)
    .where(eq(adminFeatureFlags.key, key))
    .limit(1);

  if (flag) {
    await redis.setex(`${CACHE_PREFIX}${key}`, CACHE_TTL, JSON.stringify(flag.value));
    return flag.value;
  }
  return null;
}

export async function setFlag(
  db: Database,
  key: string,
  value: unknown,
  adminId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: adminFeatureFlags.id, value: adminFeatureFlags.value })
    .from(adminFeatureFlags)
    .where(eq(adminFeatureFlags.key, key))
    .limit(1);

  if (!existing) return;

  await db
    .update(adminFeatureFlags)
    .set({ value, updatedBy: adminId, updatedAt: new Date() })
    .where(eq(adminFeatureFlags.key, key));

  // Bust cache
  const redis = getRedisClient();
  await redis.del(`${CACHE_PREFIX}${key}`);
  await redis.del(`${CACHE_PREFIX}all`);

  // Audit log
  await db.insert(adminAuditLog).values({
    adminId,
    action: "flag.update",
    targetType: "flag",
    targetId: existing.id,
    details: { before: { value: existing.value }, after: { value } },
  });
}

export async function getAllFlags(db: Database): Promise<Record<string, unknown>> {
  const redis = getRedisClient();
  const cached = await redis.get(`${CACHE_PREFIX}all`);
  if (cached !== null) {
    return JSON.parse(cached);
  }

  const flags = await db.select().from(adminFeatureFlags);
  const result: Record<string, unknown> = {};
  for (const flag of flags) {
    result[flag.key] = flag.value;
  }

  await redis.setex(`${CACHE_PREFIX}all`, CACHE_TTL, JSON.stringify(result));
  return result;
}

export async function getFlagsByCategory(
  db: Database,
  category: string,
): Promise<(typeof adminFeatureFlags.$inferSelect)[]> {
  return db.select().from(adminFeatureFlags).where(eq(adminFeatureFlags.category, category));
}
