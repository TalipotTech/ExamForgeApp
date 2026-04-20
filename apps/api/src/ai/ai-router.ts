import { generateObject, generateText, streamText, embedMany } from "ai";
import type { z } from "zod";
import type { AiProvider } from "@examforge/shared";
import type { Database } from "@examforge/shared/db";
import type {
  AITask,
  AIRequestParams,
  AIStreamParams,
  AIRequestResult,
  EmbedRequestParams,
  ProviderMapping,
} from "./types.js";
import { getLanguageModel, getEmbeddingModel } from "./providers.js";
import { buildCacheKey, getCachedResult, setCachedResult } from "./cache.js";
import { checkRateLimit } from "./rate-limiter.js";
import { checkBudget } from "./budget.js";
import { estimateCost } from "./cost.js";
import { logAICall } from "./logger.js";
import { withRetry } from "./retry.js";

// ─── Task → Provider Mapping ───

const TASK_PROVIDER_MAP: Record<AITask, ProviderMapping> = {
  generate_question: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  generate_question_bulk: {
    primary: "mistral",
    model: "mistral-large-latest",
    fallback: "anthropic",
    fallbackModel: "claude-sonnet-4-20250514",
  },
  generate_from_video: {
    primary: "google",
    model: "gemini-2.0-flash",
  },
  generate_from_document: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "google",
    fallbackModel: "gemini-2.0-flash",
  },
  verify_answer: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  search_current_affairs: {
    primary: "perplexity",
    model: "sonar-pro",
  },
  embed_text: {
    primary: "openai",
    model: "text-embedding-3-small",
  },
  translate: {
    primary: "google",
    model: "gemini-2.0-flash",
    fallback: "anthropic",
    fallbackModel: "claude-sonnet-4-20250514",
  },
  classify_difficulty: {
    primary: "mistral",
    model: "mistral-large-latest",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  extract_syllabus: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "google",
    fallbackModel: "gemini-2.0-flash",
  },
  generate_tutorial: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  generate_mcq_from_tutorial: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "mistral",
    fallbackModel: "mistral-large-latest",
  },
  extract_questions_from_web: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  discover_exams: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "google",
    fallbackModel: "gemini-2.0-flash",
  },
  analyze_source: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  parse_content_query: {
    primary: "mistral",
    model: "mistral-large-latest",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  search_web_content: {
    primary: "perplexity",
    model: "sonar-pro",
  },
  extract_portal_page: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "google",
    fallbackModel: "gemini-2.0-flash",
  },
  extract_mcq_from_pdf: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  extract_answer_key: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "google",
    fallbackModel: "gemini-2.0-flash",
  },
  extract_descriptive_questions: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  extract_examination_schedule: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "google",
    fallbackModel: "gemini-2.0-flash",
  },
  generate_tutorial_html: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  topic_chat: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  general_chat: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  voice_teacher: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  classify_questions: {
    primary: "mistral",
    model: "mistral-large-latest",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  analyze_exam_pattern: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  generate_pattern_exam: {
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
  parse_portal_page: {
    // Universal Discovery v2: needs reasoning over messy HTML-derived markdown
    // across many formats. Claude Sonnet handles semantic extraction best;
    // GPT-4o is a capable fallback.
    primary: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallback: "openai",
    fallbackModel: "gpt-4o",
  },
};

// ─── Provider → Default Model mapping ───
// Used when overrideProvider is set but overrideModel is not,
// so we pick a valid model for the target provider instead of
// using the task's default model (which belongs to a different provider).

const PROVIDER_DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
  mistral: "mistral-large-latest",
  perplexity: "sonar-pro",
};

// ─── Task → Feature mapping for logging ───

function taskToFeature(task: AITask): string {
  const map: Record<AITask, string> = {
    generate_question: "generate",
    generate_question_bulk: "generate",
    generate_from_video: "generate",
    generate_from_document: "generate",
    verify_answer: "verify",
    search_current_affairs: "search",
    embed_text: "embed",
    translate: "translate",
    classify_difficulty: "classify",
    extract_syllabus: "scrape",
    generate_tutorial: "generate",
    generate_mcq_from_tutorial: "generate",
    extract_questions_from_web: "scrape",
    discover_exams: "scrape",
    analyze_source: "scrape",
    parse_content_query: "search",
    search_web_content: "search",
    extract_portal_page: "scrape",
    extract_mcq_from_pdf: "scrape",
    extract_answer_key: "scrape",
    extract_descriptive_questions: "scrape",
    extract_examination_schedule: "scrape",
    generate_tutorial_html: "tutorial",
    topic_chat: "chat",
    general_chat: "chat",
    voice_teacher: "chat",
    classify_questions: "pattern",
    analyze_exam_pattern: "pattern",
    generate_pattern_exam: "pattern",
    parse_portal_page: "discovery",
  };
  return map[task];
}

// ─── Main Router: Structured Output ───

export async function routeAIRequest<T extends z.ZodTypeAny>(
  params: AIRequestParams<T>,
  db: Database,
): Promise<AIRequestResult<z.infer<T>>> {
  const rateCheck = await checkRateLimit(params.userId);
  if (!rateCheck.allowed) {
    throw new AIRouterError(
      "RATE_LIMITED",
      `Rate limit exceeded. ${rateCheck.remaining} requests remaining this minute.`,
    );
  }

  const budgetCheck = await checkBudget(db);
  if (!budgetCheck.allowed) {
    throw new AIRouterError(
      "BUDGET_EXCEEDED",
      `Monthly AI budget of $${budgetCheck.budgetUsd} exceeded. Used: $${budgetCheck.usedUsd.toFixed(4)}`,
    );
  }

  const mapping = TASK_PROVIDER_MAP[params.task];
  const provider = params.overrideProvider ?? mapping.primary;
  const model =
    params.overrideModel ??
    (params.overrideProvider ? PROVIDER_DEFAULT_MODELS[provider] : mapping.model);

  if (!params.skipCache) {
    const cacheKey = buildCacheKey(provider, model, params.prompt, params.systemPrompt);
    const cached = await getCachedResult<z.infer<T>>(cacheKey);
    if (cached !== null) {
      const logId = await logAICall(db, {
        provider,
        model,
        feature: taskToFeature(params.task),
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        estimatedCostUsd: 0,
        userId: params.userId,
        examId: params.examId,
      });
      return {
        data: cached,
        provider,
        model,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: 0,
        estimatedCostUsd: 0,
        cached: true,
        logId,
      };
    }
  }

  const startTime = Date.now();
  let result: AIRequestResult<z.infer<T>>;

  try {
    result = await withRetry(() => callProvider<T>(provider, model, params, db, startTime));
  } catch (primaryError) {
    if (mapping.fallback && mapping.fallbackModel) {
      console.warn(
        `Primary provider ${provider}/${model} failed after retries. Trying fallback: ${mapping.fallback}/${mapping.fallbackModel}`,
        primaryError,
      );
      const fallbackStart = Date.now();
      try {
        result = await withRetry(() =>
          callProvider<T>(mapping.fallback!, mapping.fallbackModel!, params, db, fallbackStart),
        );
      } catch (fallbackError) {
        throw new AIRouterError(
          "ALL_PROVIDERS_FAILED",
          `Both primary (${provider}) and fallback (${mapping.fallback}) providers failed.`,
          { primaryError, fallbackError },
        );
      }
    } else {
      throw primaryError;
    }
  }

  if (!params.skipCache) {
    const cacheKey = buildCacheKey(provider, model, params.prompt, params.systemPrompt);
    await setCachedResult(cacheKey, result.data).catch((err) => {
      console.warn("Failed to cache AI result:", err);
    });
  }

  return result;
}

// ─── Internal: Call a single provider with generateObject ───

async function callProvider<T extends z.ZodTypeAny>(
  provider: AiProvider,
  model: string,
  params: AIRequestParams<T>,
  db: Database,
  startTime: number,
): Promise<AIRequestResult<z.infer<T>>> {
  const languageModel = getLanguageModel(provider, model);

  let response;
  try {
    response = await generateObject({
      model: languageModel,
      schema: params.schema,
      prompt: params.prompt,
      system: params.systemPrompt,
      temperature: params.temperature,
      maxOutputTokens: params.maxTokens,
    });
  } catch (error) {
    throw toUserFriendlyAIError(error, provider);
  }

  const latencyMs = Date.now() - startTime;
  const inputTokens = response.usage.inputTokens ?? 0;
  const outputTokens = response.usage.outputTokens ?? 0;
  const cost = estimateCost(model, inputTokens, outputTokens);

  const logId = await logAICall(db, {
    provider,
    model,
    feature: taskToFeature(params.task),
    inputTokens,
    outputTokens,
    latencyMs,
    estimatedCostUsd: cost,
    userId: params.userId,
    examId: params.examId,
  });

  return {
    data: response.object,
    provider,
    model,
    usage: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
    latencyMs,
    estimatedCostUsd: cost,
    cached: false,
    logId,
  };
}

// ─── Text Generation (non-structured, e.g. HTML fragments) ───

export async function routeTextRequest(
  params: AIStreamParams,
  db: Database,
): Promise<AIRequestResult<string>> {
  const rateCheck = await checkRateLimit(params.userId);
  if (!rateCheck.allowed) {
    throw new AIRouterError("RATE_LIMITED", "Rate limit exceeded.");
  }

  const budgetCheck = await checkBudget(db);
  if (!budgetCheck.allowed) {
    throw new AIRouterError("BUDGET_EXCEEDED", "Monthly AI budget exceeded.");
  }

  const mapping = TASK_PROVIDER_MAP[params.task];
  const provider = params.overrideProvider ?? mapping.primary;
  const model =
    params.overrideModel ??
    (params.overrideProvider ? PROVIDER_DEFAULT_MODELS[provider] : mapping.model);
  const languageModel = getLanguageModel(provider, model);

  const startTime = Date.now();

  let response;
  try {
    response = await withRetry(async () => {
      return generateText({
        model: languageModel,
        prompt: params.prompt,
        system: params.systemPrompt,
        temperature: params.temperature,
        maxOutputTokens: params.maxTokens ?? 8192,
      });
    });
  } catch (error) {
    if (error instanceof AIRouterError) throw error;
    throw toUserFriendlyAIError(error, provider);
  }

  const latencyMs = Date.now() - startTime;
  const inputTokens = response.usage.inputTokens ?? 0;
  const outputTokens = response.usage.outputTokens ?? 0;
  const cost = estimateCost(model, inputTokens, outputTokens);

  const logId = await logAICall(db, {
    provider,
    model,
    feature: taskToFeature(params.task),
    inputTokens,
    outputTokens,
    latencyMs,
    estimatedCostUsd: cost,
    userId: params.userId,
    examId: params.examId,
  });

  return {
    data: response.text,
    provider,
    model,
    usage: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
    latencyMs,
    estimatedCostUsd: cost,
    cached: false,
    logId,
  };
}

// ─── Streaming Variant (unstructured text responses) ───

export async function routeStreamingRequest(
  params: AIStreamParams,
  db: Database,
): Promise<ReturnType<typeof streamText>> {
  const rateCheck = await checkRateLimit(params.userId);
  if (!rateCheck.allowed) {
    throw new AIRouterError("RATE_LIMITED", "Rate limit exceeded.");
  }

  const budgetCheck = await checkBudget(db);
  if (!budgetCheck.allowed) {
    throw new AIRouterError("BUDGET_EXCEEDED", "Monthly AI budget exceeded.");
  }

  const mapping = TASK_PROVIDER_MAP[params.task];
  const provider = params.overrideProvider ?? mapping.primary;
  const model =
    params.overrideModel ??
    (params.overrideProvider ? PROVIDER_DEFAULT_MODELS[provider] : mapping.model);
  const languageModel = getLanguageModel(provider, model);

  const startTime = Date.now();

  const result = streamText({
    model: languageModel,
    prompt: params.prompt,
    system: params.systemPrompt,
    temperature: params.temperature,
    maxOutputTokens: params.maxTokens,
    onFinish: async ({ usage }) => {
      const latencyMs = Date.now() - startTime;
      const cost = estimateCost(model, usage.inputTokens ?? 0, usage.outputTokens ?? 0);
      await logAICall(db, {
        provider,
        model,
        feature: taskToFeature(params.task),
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        latencyMs,
        estimatedCostUsd: cost,
        userId: params.userId,
        examId: params.examId,
      }).catch((err) => {
        console.error("Failed to log streaming AI call:", err);
      });
    },
  });

  return result;
}

// ─── Embedding Request ───

export async function routeEmbedRequest(
  params: EmbedRequestParams,
  db: Database,
): Promise<{ embeddings: number[][]; usage: { totalTokens: number } }> {
  const rateCheck = await checkRateLimit(params.userId);
  if (!rateCheck.allowed) {
    throw new AIRouterError("RATE_LIMITED", "Rate limit exceeded.");
  }

  const startTime = Date.now();
  const embeddingModel = getEmbeddingModel("text-embedding-3-small");

  const response = await embedMany({
    model: embeddingModel,
    values: params.texts,
  });

  const latencyMs = Date.now() - startTime;
  const totalTokens = response.usage.tokens;
  const cost = estimateCost("text-embedding-3-small", totalTokens, 0);

  await logAICall(db, {
    provider: "openai",
    model: "text-embedding-3-small",
    feature: "embed",
    inputTokens: totalTokens,
    outputTokens: 0,
    latencyMs,
    estimatedCostUsd: cost,
    userId: params.userId,
    examId: params.examId,
  });

  return {
    embeddings: response.embeddings,
    usage: { totalTokens },
  };
}

// ─── Backward compatibility re-exports ───

export { getModelConfig, getAiDefaults } from "./compat.js";
export type { AiCallLog } from "./compat.js";

// ─── Error class ───

export class AIRouterError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AIRouterError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Convert raw provider errors into user-friendly messages.
 * Detects quota, auth, and rate limit issues from all providers.
 */
export function toUserFriendlyAIError(error: unknown, provider?: string): AIRouterError {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  const providerLabel = provider
    ? ({
        anthropic: "Claude",
        google: "Gemini",
        openai: "ChatGPT",
        mistral: "Mistral",
        perplexity: "Perplexity",
      }[provider] ?? provider)
    : "AI provider";

  // Quota / billing
  if (lower.includes("quota") && lower.includes("exceeded")) {
    return new AIRouterError(
      "PROVIDER_QUOTA_EXCEEDED",
      `${providerLabel} API quota exceeded. Please try a different AI provider or try again later.`,
      { originalError: msg, provider },
    );
  }

  if (
    lower.includes("insufficient_quota") ||
    (lower.includes("billing") && lower.includes("hard limit"))
  ) {
    return new AIRouterError(
      "PROVIDER_QUOTA_EXCEEDED",
      `${providerLabel} billing limit reached. Please try a different AI provider.`,
      { originalError: msg, provider },
    );
  }

  // Rate limits
  if (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("too many requests")
  ) {
    return new AIRouterError(
      "PROVIDER_RATE_LIMITED",
      `${providerLabel} is temporarily overloaded. Please wait a moment and try again, or switch to a different provider.`,
      { originalError: msg, provider },
    );
  }

  // Auth errors
  if (
    lower.includes("invalid api key") ||
    lower.includes("invalid_api_key") ||
    lower.includes("unauthorized")
  ) {
    return new AIRouterError(
      "PROVIDER_AUTH_ERROR",
      `${providerLabel} is temporarily unavailable. Please try a different AI provider.`,
      { originalError: msg, provider },
    );
  }

  // Content filter / safety
  if (lower.includes("content filter") || lower.includes("safety") || lower.includes("blocked")) {
    return new AIRouterError(
      "CONTENT_FILTERED",
      `Your message was filtered by ${providerLabel}'s safety system. Please rephrase your question.`,
      { originalError: msg, provider },
    );
  }

  // Generic fallback
  return new AIRouterError(
    "PROVIDER_ERROR",
    `${providerLabel} encountered an error. Please try again or switch to a different provider.`,
    { originalError: msg, provider },
  );
}
