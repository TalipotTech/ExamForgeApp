import { z } from "zod";
import { questionContentSchema } from "./question";

// ─── Job data validated before enqueuing ───

export const scrapeJobDataSchema = z.object({
  sourceId: z.string().uuid(),
  runId: z.string().uuid().optional(),
  url: z.string().url(),
  examId: z.string().uuid(),
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  maxPages: z.number().int().min(1).max(500).default(50),
});

export type ScrapeJobData = z.infer<typeof scrapeJobDataSchema>;

// ─── Schema for AI-extracted questions from a single page ───

export const extractedQuestionSchema = z.object({
  content: questionContentSchema,
  subject: z.string().min(1),
  topic: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export type ExtractedQuestion = z.infer<typeof extractedQuestionSchema>;

export const extractedQuestionsResponseSchema = z.object({
  questions: z.array(extractedQuestionSchema),
  pageRelevance: z.enum(["high", "medium", "low", "none"]),
});

export type ExtractedQuestionsResponse = z.infer<typeof extractedQuestionsResponseSchema>;

// ─── Progress event shape ───

export const scrapeProgressSchema = z.object({
  pagesVisited: z.number(),
  pagesTotal: z.number(),
  questionsFound: z.number(),
  duplicatesSkipped: z.number(),
  errorsCount: z.number(),
  currentPage: z.string().optional(),
  status: z.enum(["crawling", "extracting", "deduplicating", "completed", "failed"]),
});

export type ScrapeProgress = z.infer<typeof scrapeProgressSchema>;
