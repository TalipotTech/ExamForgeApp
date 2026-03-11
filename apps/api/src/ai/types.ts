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
  | "generate_mcq_from_tutorial";

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
