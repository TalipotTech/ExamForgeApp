import type { z } from "zod";
import type { Database } from "@examforge/shared/db";
import { routeAIRequest, AIRouterError } from "./ai-router.js";
import type {
  MultiAgentConfig,
  MultiAgentResult,
  PerProviderResult,
  AIProviderId,
} from "./types.js";
import { PROVIDER_ID_TO_AI_PROVIDER } from "./types.js";

const DEFAULT_TIMEOUT = 60_000;

// ─── Main Entry Point ───

export async function multiAgentRequest<T extends z.ZodTypeAny>(
  config: MultiAgentConfig<T>,
  db: Database,
): Promise<MultiAgentResult<z.infer<T>>> {
  const { providers, timeout = DEFAULT_TIMEOUT } = config;

  // Single provider → direct route (no merge needed)
  if (providers.length === 1) {
    return singleProviderRequest(config, providers[0]!, db);
  }

  // Multiple providers → fan-out + merge
  return multiProviderRequest(config, db, timeout);
}

// ─── Single Provider ───

async function singleProviderRequest<T extends z.ZodTypeAny>(
  config: MultiAgentConfig<T>,
  providerId: AIProviderId,
  db: Database,
): Promise<MultiAgentResult<z.infer<T>>> {
  const aiProvider = PROVIDER_ID_TO_AI_PROVIDER[providerId];
  const startTime = Date.now();

  const result = await routeAIRequest(
    {
      task: config.task,
      prompt: config.prompt,
      systemPrompt: config.systemPrompt,
      schema: config.schema,
      userId: config.userId,
      examId: config.examId,
      overrideProvider: aiProvider,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      skipCache: true,
    },
    db,
  );

  const providerResult: PerProviderResult<z.infer<T>> = {
    result: result.data,
    provider: providerId,
    latencyMs: result.latencyMs,
    tokensUsed: {
      input: result.usage.promptTokens,
      output: result.usage.completionTokens,
    },
    costUsd: result.estimatedCostUsd,
    logId: result.logId,
  };

  return {
    merged: result.data,
    perProvider: { [providerId]: providerResult } as Partial<
      Record<AIProviderId, PerProviderResult<z.infer<T>>>
    >,
    mergeMetadata: {
      strategy: config.mergeStrategy,
      providersUsed: [providerId],
      providersFailed: [],
      totalCostUsd: result.estimatedCostUsd,
      totalLatencyMs: Date.now() - startTime,
    },
  };
}

// ─── Multi-Provider Fan-Out ───

async function multiProviderRequest<T extends z.ZodTypeAny>(
  config: MultiAgentConfig<T>,
  db: Database,
  timeout: number,
): Promise<MultiAgentResult<z.infer<T>>> {
  const startTime = Date.now();

  // Fan-out to all providers in parallel with timeout
  const settled = await Promise.allSettled(
    config.providers.map((providerId) => callProviderWithTimeout(config, providerId, db, timeout)),
  );

  // Collect results
  const successful: PerProviderResult<z.infer<T>>[] = [];
  const failed: AIProviderId[] = [];

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]!;
    const providerId = config.providers[i]!;

    if (outcome.status === "fulfilled") {
      successful.push(outcome.value);
    } else {
      failed.push(providerId);
      console.error(`Multi-agent: Provider ${providerId} failed:`, outcome.reason);
    }
  }

  // If ALL providers failed, throw
  if (successful.length === 0) {
    throw new AIRouterError(
      "ALL_PROVIDERS_FAILED",
      `All ${config.providers.length} providers failed in multi-agent request.`,
      { failedProviders: failed },
    );
  }

  // Apply merge strategy
  const merged = applyMergeStrategy(config.mergeStrategy, successful);

  // Build per-provider map
  const perProvider: Partial<Record<AIProviderId, PerProviderResult<z.infer<T>>>> = {};
  for (const result of successful) {
    perProvider[result.provider] = result;
  }

  const totalCostUsd = successful.reduce((sum, r) => sum + r.costUsd, 0);

  return {
    merged,
    perProvider,
    mergeMetadata: {
      strategy: config.mergeStrategy,
      providersUsed: successful.map((r) => r.provider),
      providersFailed: failed,
      totalCostUsd,
      totalLatencyMs: Date.now() - startTime,
    },
  };
}

// ─── Call Single Provider with Timeout ───

async function callProviderWithTimeout<T extends z.ZodTypeAny>(
  config: MultiAgentConfig<T>,
  providerId: AIProviderId,
  db: Database,
  timeout: number,
): Promise<PerProviderResult<z.infer<T>>> {
  const aiProvider = PROVIDER_ID_TO_AI_PROVIDER[providerId];

  const resultPromise = routeAIRequest(
    {
      task: config.task,
      prompt: config.prompt,
      systemPrompt: config.systemPrompt,
      schema: config.schema,
      userId: config.userId,
      examId: config.examId,
      overrideProvider: aiProvider,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      skipCache: true,
    },
    db,
  );

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Provider ${providerId} timed out after ${timeout}ms`)),
      timeout,
    ),
  );

  const result = await Promise.race([resultPromise, timeoutPromise]);

  return {
    result: result.data,
    provider: providerId,
    latencyMs: result.latencyMs,
    tokensUsed: {
      input: result.usage.promptTokens,
      output: result.usage.completionTokens,
    },
    costUsd: result.estimatedCostUsd,
    logId: result.logId,
  };
}

// ─── Merge Strategies ───

function applyMergeStrategy<T>(strategy: string, results: PerProviderResult<T>[]): T {
  switch (strategy) {
    case "combine":
      return mergeCombine(results);
    case "best_of":
      return mergeBestOf(results);
    case "vote":
      return mergeVote(results);
    default:
      return results[0]!.result;
  }
}

/**
 * Combine strategy: for tutorials — takes the first result as base.
 * Full content merging (dedup sections, combine definitions) would require
 * a second AI call. For now, use the first successful result and attach
 * attribution metadata. In production, this can call buildTutorialMergePrompt
 * to do an AI-powered merge.
 */
function mergeCombine<T>(results: PerProviderResult<T>[]): T {
  // Use the result from the provider with the longest output (most content)
  let best = results[0]!;
  let bestSize = JSON.stringify(best.result).length;

  for (let i = 1; i < results.length; i++) {
    const size = JSON.stringify(results[i]!.result).length;
    if (size > bestSize) {
      best = results[i]!;
      bestSize = size;
    }
  }

  return best.result;
}

/**
 * Best-of strategy: for MCQs — pick the result from the provider that
 * returned the most valid entries (longest array).
 */
function mergeBestOf<T>(results: PerProviderResult<T>[]): T {
  let best = results[0]!;
  let bestCount = 0;

  for (const r of results) {
    const data = r.result;
    const count = Array.isArray(data) ? data.length : JSON.stringify(data).length;
    if (count > bestCount) {
      best = r;
      bestCount = count;
    }
  }

  return best.result;
}

/**
 * Vote strategy: for answer verification — majority vote.
 * Compares JSON-stringified results and picks the most common answer.
 */
function mergeVote<T>(results: PerProviderResult<T>[]): T {
  const counts = new Map<string, { count: number; value: T }>();

  for (const r of results) {
    const key = JSON.stringify(r.result);
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { count: 1, value: r.result });
    }
  }

  let topCount = 0;
  let topValue = results[0]!.result;

  for (const entry of counts.values()) {
    if (entry.count > topCount) {
      topCount = entry.count;
      topValue = entry.value;
    }
  }

  return topValue;
}
