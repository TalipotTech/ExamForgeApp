import { type ConnectionOptions } from "bullmq";

export function getBullMQConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL environment variable is required");
  }
  return {
    host: new URL(url).hostname,
    port: Number(new URL(url).port) || 6379,
    password: new URL(url).password || undefined,
    maxRetriesPerRequest: null,
  };
}
