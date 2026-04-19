import type { z } from "zod";
import type { AiProvider } from "@examforge/shared";
import type { Database } from "@examforge/shared/db";

export type AITask =
  | "generate_question"
  | "generate_question_bulk"
  | "generate_from_video"
  | "generate_from_document"
  | "verify_answer"
  | "search_current_affairs"
  | "embed_text"
  | "translate"
  | "classify_difficulty"
  | "extract_syllabus"
  | "generate_tutorial"
  | "generate_mcq_from_tutorial"
  | "extract_questions_from_web"
  | "discover_exams"
  | "analyze_source"
  | "parse_content_query"
  | "search_web_content"
  | "extract_portal_page"
  | "extract_mcq_from_pdf"
  | "extract_answer_key"
  | "extract_descriptive_questions"
  | "extract_examination_schedule"
  | "generate_tutorial_html"
  | "topic_chat"
  | "general_chat"
  | "voice_teacher"
  | "classify_questions"
  | "analyze_exam_pattern"
  | "generate_pattern_exam";

export type ProviderMapping = {
  primary: AiProvider;
  model: string;
  fallback?: AiProvider;
  fallbackModel?: string;
};

export type AIRequestParams<T extends z.ZodTypeAny> = {
  task: AITask;
  prompt: string;
  systemPrompt?: string;
  schema: T;
  userId: string;
  examId?: string;
  overrideProvider?: AiProvider;
  overrideModel?: string;
  temperature?: number;
  maxTokens?: number;
  skipCache?: boolean;
};

export type AIStreamParams = {
  task: AITask;
  prompt: string;
  systemPrompt?: string;
  userId: string;
  examId?: string;
  overrideProvider?: AiProvider;
  overrideModel?: string;
  temperature?: number;
  maxTokens?: number;
};

export type EmbedRequestParams = {
  task: "embed_text";
  texts: string[];
  userId: string;
  examId?: string;
};

export type AIRequestResult<T> = {
  data: T;
  provider: AiProvider;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  estimatedCostUsd: number;
  cached: boolean;
  logId: string;
};

export type AIRouterDeps = {
  db: Database;
};

// ─── Multi-Agent Types ───

export type AIProviderId = "claude" | "gemini" | "openai" | "mistral" | "perplexity";

export const PROVIDER_ID_TO_AI_PROVIDER: Record<AIProviderId, AiProvider> = {
  claude: "anthropic",
  gemini: "google",
  openai: "openai",
  mistral: "mistral",
  perplexity: "perplexity",
};

export type MergeStrategy = "combine" | "best_of" | "vote";

export type MultiAgentConfig<T extends z.ZodTypeAny> = {
  task: AITask;
  providers: AIProviderId[];
  prompt: string;
  systemPrompt?: string;
  schema: T;
  mergeStrategy: MergeStrategy;
  timeout?: number;
  userId: string;
  examId?: string;
  temperature?: number;
  maxTokens?: number;
};

export type PerProviderResult<T> = {
  result: T;
  provider: AIProviderId;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
  costUsd: number;
  logId: string;
};

export type MultiAgentResult<T> = {
  merged: T;
  perProvider: Partial<Record<AIProviderId, PerProviderResult<T>>>;
  mergeMetadata: {
    strategy: MergeStrategy;
    providersUsed: AIProviderId[];
    providersFailed: AIProviderId[];
    totalCostUsd: number;
    totalLatencyMs: number;
  };
};
