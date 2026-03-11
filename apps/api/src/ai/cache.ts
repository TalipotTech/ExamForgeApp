import { createHash } from "node:crypto";
import { getRedisClient } from "../lib/redis.js";

const CACHE_PREFIX = "ai:cache:";

export function buildCacheKey(
  provider: string,
  model: string,
  prompt: string,
  systemPrompt?: string,
): string {
  const hash = createHash("sha256")
    .update(`${provider}:${model}:${systemPrompt ?? ""}:${prompt}`)
    .digest("hex");
  return `${CACHE_PREFIX}${hash}`;
}

export async function getCachedResult<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setCachedResult<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
  const redis = getRedisClient();
  const ttl = ttlSeconds ?? (Number(process.env.AI_CACHE_TTL_SECONDS) || 86400);
  await redis.set(key, JSON.stringify(data), "EX", ttl);
}
