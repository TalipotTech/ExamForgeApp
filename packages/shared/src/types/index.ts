export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: string;
  code?: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type AiProvider = "anthropic" | "openai" | "google" | "mistral" | "perplexity";

export type AiFeature =
  | "generate"
  | "verify"
  | "scrape"
  | "embed"
  | "search"
  | "translate"
  | "classify";

export type ExamCategory = "bpharm_asst_prof" | "neet" | "gpat" | "upsc" | "state_psc" | "gate";

export type Difficulty = "easy" | "medium" | "hard";

export type QuestionType = "mcq" | "true_false" | "fill_blank" | "match" | "assertion";

export type UserRole = "student" | "teacher" | "admin" | "superadmin";
