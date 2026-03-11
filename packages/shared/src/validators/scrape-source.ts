import { z } from "zod";

export const createScrapeSourceSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url().max(1000),
  examId: z.string().uuid().optional(),
  sourceType: z
    .enum(["question_bank", "previous_year", "mock_test", "syllabus", "notes", "portal"])
    .default("question_bank"),
  scrapeFrequency: z.enum(["manual", "daily", "weekly", "monthly"]).default("manual"),
  scrapeDepth: z.number().int().min(1).max(10).default(1),
  contentFormat: z.enum(["html", "pdf", "image", "mixed"]).default("html"),
  aiProvider: z.string().max(50).default("auto"),
  notes: z.string().max(2000).optional(),
  config: z
    .object({
      crawlerType: z.enum(["cheerio", "playwright"]).optional(),
      maxPages: z.number().int().min(1).max(500).optional(),
      fetchDelayMs: z.number().int().min(500).max(30000).optional(),
      urlPatterns: z.array(z.string()).optional(),
      excludePatterns: z.array(z.string()).optional(),
      contentSelector: z.string().optional(),
      defaultSubject: z.string().optional(),
      defaultDifficulty: z.enum(["easy", "medium", "hard"]).optional(),
      questionTypes: z
        .array(z.enum(["mcq", "true_false", "fill_blank", "match", "assertion"]))
        .optional(),
    })
    .optional(),
});

export type CreateScrapeSource = z.infer<typeof createScrapeSourceSchema>;

export const updateScrapeSourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  url: z.string().url().max(1000).optional(),
  examId: z.string().uuid().nullable().optional(),
  sourceType: z
    .enum(["question_bank", "previous_year", "mock_test", "syllabus", "notes", "portal"])
    .optional(),
  scrapeFrequency: z.enum(["manual", "daily", "weekly", "monthly"]).optional(),
  scrapeDepth: z.number().int().min(1).max(10).optional(),
  contentFormat: z.enum(["html", "pdf", "image", "mixed"]).optional(),
  aiProvider: z.string().max(50).optional(),
  notes: z.string().max(2000).nullable().optional(),
  config: z
    .object({
      crawlerType: z.enum(["cheerio", "playwright"]).optional(),
      maxPages: z.number().int().min(1).max(500).optional(),
      fetchDelayMs: z.number().int().min(500).max(30000).optional(),
      urlPatterns: z.array(z.string()).optional(),
      excludePatterns: z.array(z.string()).optional(),
      contentSelector: z.string().optional(),
      defaultSubject: z.string().optional(),
      defaultDifficulty: z.enum(["easy", "medium", "hard"]).optional(),
      questionTypes: z
        .array(z.enum(["mcq", "true_false", "fill_blank", "match", "assertion"]))
        .optional(),
    })
    .optional(),
});

export type UpdateScrapeSource = z.infer<typeof updateScrapeSourceSchema>;

export const scrapeSourceFilterSchema = z.object({
  examId: z.string().uuid().optional(),
  status: z.enum(["pending", "active", "paused", "error", "completed"]).optional(),
  sourceType: z
    .enum(["question_bank", "previous_year", "mock_test", "syllabus", "notes", "portal"])
    .optional(),
  search: z.string().max(200).optional(),
});

export type ScrapeSourceFilter = z.infer<typeof scrapeSourceFilterSchema>;
