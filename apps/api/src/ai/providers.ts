import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import type { LanguageModel, EmbeddingModel } from "ai";
import type { AiProvider } from "@examforge/shared";

let anthropic: ReturnType<typeof createAnthropic> | null = null;
let openai: ReturnType<typeof createOpenAI> | null = null;
let google: ReturnType<typeof createGoogleGenerativeAI> | null = null;
let mistral: ReturnType<typeof createMistral> | null = null;
let perplexity: ReturnType<typeof createOpenAI> | null = null;

function getAnthropic(): ReturnType<typeof createAnthropic> {
  if (!anthropic) {
    anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return anthropic;
}

function getOpenAI(): ReturnType<typeof createOpenAI> {
  if (!openai) {
    openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return openai;
}

function getGoogle(): ReturnType<typeof createGoogleGenerativeAI> {
  if (!google) {
    google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
    });
  }
  return google;
}

function getMistral(): ReturnType<typeof createMistral> {
  if (!mistral) {
    mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY! });
  }
  return mistral;
}

function getPerplexity(): ReturnType<typeof createOpenAI> {
  if (!perplexity) {
    perplexity = createOpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY!,
      baseURL: "https://api.perplexity.ai",
    });
  }
  return perplexity;
}

export function getLanguageModel(provider: AiProvider, model: string): LanguageModel {
  switch (provider) {
    case "anthropic":
      return getAnthropic()(model);
    case "openai":
      return getOpenAI()(model);
    case "google":
      return getGoogle()(model);
    case "mistral":
      return getMistral()(model);
    case "perplexity":
      return getPerplexity()(model);
    default:
      throw new Error(`Unknown provider: ${provider satisfies never}`);
  }
}

export function getEmbeddingModel(model: string): EmbeddingModel {
  return getOpenAI().embedding(model);
}
