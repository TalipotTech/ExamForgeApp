import { z } from "zod";

export const searchQuerySchema = z.object({
  query: z.string().min(3).max(500),
  contentType: z
    .enum(["all", "previous_questions", "syllabus", "mock_test", "study_material", "answer_key"])
    .default("all"),
  year: z.number().min(2010).max(2030).optional(),
  format: z.enum(["all", "pdf", "web"]).default("all"),
  examId: z.string().uuid().optional(),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const parsedQuerySchema = z.object({
  intent: z.enum([
    "previous_questions",
    "syllabus",
    "mock_test",
    "study_material",
    "answer_key",
    "notification",
    "general",
  ]),
  examName: z.string().nullable(),
  examYear: z.number().nullable(),
  subject: z.string().nullable(),
  contentFormat: z.enum(["pdf", "web", "any"]),
  keywords: z.array(z.string()),
  specificSource: z.string().nullable(),
});
export type ParsedQuery = z.infer<typeof parsedQuerySchema>;

export const searchResultItemSchema = z.object({
  title: z.string(),
  sourceUrl: z.string().url(),
  sourceName: z.string().optional(),
  sourceDomain: z.string().optional(),
  contentType: z.enum([
    "pdf",
    "web_page",
    "question_set",
    "syllabus",
    "answer_key",
    "study_material",
  ]),
  snippet: z.string().optional(),
  matchQuality: z.enum(["high", "medium", "low"]),
  relevanceScore: z.number().min(0).max(1),
  sourceQuality: z.enum(["official", "established", "community", "unknown"]).default("unknown"),
  metadata: z.record(z.any()).default({}),
});
export type SearchResultItem = z.infer<typeof searchResultItemSchema>;

export const saveResultSchema = z.object({
  resultId: z.string().uuid(),
  saveType: z.enum(["bookmark", "download_pdf", "extract_text"]),
  examId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
});
export type SaveResult = z.infer<typeof saveResultSchema>;

export const extractQuestionsSchema = z.object({
  resultId: z.string().uuid(),
  provider: z.enum(["claude", "gemini", "openai", "mistral", "auto"]).default("auto"),
});
export type ExtractQuestions = z.infer<typeof extractQuestionsSchema>;

export const extractSyllabusSchema = z.object({
  resultId: z.string().uuid(),
  provider: z.enum(["claude", "gemini", "openai", "mistral", "auto"]).default("auto"),
});
export type ExtractSyllabus = z.infer<typeof extractSyllabusSchema>;
