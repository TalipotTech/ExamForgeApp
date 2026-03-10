import { AI_MODELS, AI_DEFAULTS } from "@examforge/shared/constants";
import type { AiProvider, AiFeature } from "@examforge/shared";

type AiModelKey = keyof typeof AI_MODELS;

type ModelConfig = {
  provider: AiProvider;
  model: string;
};

export function getModelConfig(task: AiModelKey): ModelConfig {
  const config = AI_MODELS[task];
  return {
    provider: config.provider as AiProvider,
    model: config.model,
  };
}

export function getAiDefaults(): typeof AI_DEFAULTS {
  return AI_DEFAULTS;
}

export type AiCallLog = {
  provider: AiProvider;
  model: string;
  feature: AiFeature;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
};
