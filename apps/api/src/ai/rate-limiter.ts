import { getRedisClient } from "../lib/redis.js";

const RATE_LIMIT_PREFIX = "ai:ratelimit:";

export async function checkRateLimit(
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedisClient();
  const limit = Number(process.env.AI_RATE_LIMIT_PER_USER_PER_MIN) || 10;
  const now = Math.floor(Date.now() / 60000);
  const key = `${RATE_LIMIT_PREFIX}${userId}:${now}`;

  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, 60);
  }

  return {
    allowed: current <= limit,
    remaining: Math.max(0, limit - current),
  };
}
