export { EXAM_PORTALS } from "./portals";
export type { PortalConfig } from "./portals";

export const EXAM_CATEGORIES = {
  bpharm_asst_prof: "BPharm Assistant Professor",
  neet: "NEET",
  gpat: "GPAT",
  upsc: "UPSC",
  state_psc: "State PSC",
  gate: "GATE",
} as const;

export const AI_MODELS = {
  "question-quality": { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  "question-bulk": { provider: "mistral", model: "mistral-large-latest" },
  "video-processing": { provider: "google", model: "gemini-2.0-flash" },
  "web-search": { provider: "perplexity", model: "sonar-pro" },
  "structured-output": { provider: "openai", model: "gpt-4o" },
  embeddings: { provider: "openai", model: "text-embedding-3-small" },
} as const;

export const EMBEDDING_DIMENSIONS = 1536;

export const AI_DEFAULTS = {
  maxRetries: 3,
  cacheTtlSeconds: 86400,
  rateLimitPerUserPerMin: 10,
} as const;

export const SUPPORTED_LANGUAGES = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  ml: "Malayalam",
} as const;

export const AI_COST_PER_1K_TOKENS = {
  "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
  "mistral-large-latest": { input: 0.002, output: 0.006 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },
  "sonar-pro": { input: 0.003, output: 0.015 },
  "text-embedding-3-small": { input: 0.00002, output: 0 },
} as const;

export const AI_PROVIDER_ENV_KEYS = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
} as const;

export const AI_PROVIDER_INFO = {
  anthropic: {
    name: "Claude (Anthropic)",
    model: "claude-sonnet-4-20250514",
    description: "Best for high-quality, nuanced questions with detailed explanations",
    strengths: ["Accurate content", "Detailed explanations", "Complex reasoning"],
    avgTokensPerQuestion: 350,
  },
  mistral: {
    name: "Mistral Large",
    model: "mistral-large-latest",
    description: "Fast and cost-effective for bulk question generation",
    strengths: ["Fast generation", "Lower cost", "Good for bulk"],
    avgTokensPerQuestion: 300,
  },
} as const;

export const QUESTION_TYPE_LABELS = {
  mcq: "Multiple Choice (MCQ)",
  true_false: "True / False",
  fill_blank: "Fill in the Blank",
  match: "Match the Following",
  assertion: "Assertion-Reason",
} as const;
