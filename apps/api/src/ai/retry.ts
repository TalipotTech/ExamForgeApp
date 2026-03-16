export type RetryConfig = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 4000,
};

/**
 * Check if an error is non-retryable (quota exceeded, auth errors, etc.).
 * These should fail immediately instead of wasting retries.
 */
function isNonRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  // Quota / billing errors from any provider
  if (lower.includes("quota") && lower.includes("exceeded")) return true;
  if (lower.includes("rate limit") || lower.includes("rate_limit")) return true;
  if (lower.includes("billing") && (lower.includes("hard limit") || lower.includes("not active")))
    return true;
  if (lower.includes("insufficient_quota") || lower.includes("insufficient funds")) return true;

  // Auth errors
  if (lower.includes("invalid api key") || lower.includes("invalid_api_key")) return true;
  if (lower.includes("authentication") || lower.includes("unauthorized")) return true;

  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry quota/auth errors — they won't succeed on retry
      if (isNonRetryableError(error)) break;

      if (attempt === config.maxRetries) break;

      const delay = Math.min(config.baseDelayMs * Math.pow(2, attempt), config.maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
