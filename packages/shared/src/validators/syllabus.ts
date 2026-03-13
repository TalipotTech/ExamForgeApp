import { z } from "zod";

// ─── AI Provider ID ───

export const aiProviderIdSchema = z.enum(["claude", "gemini", "openai", "mistral", "perplexity"]);

export type AIProviderId = z.infer<typeof aiProviderIdSchema>;

// ─── Syllabus Node Types ───

export const syllabusNodeTypeSchema = z.enum([
  "unit",
  "chapter",
  "topic",
  "subtopic",
  "definition",
  "formula",
  "objective",
]);

export type SyllabusNodeType = z.infer<typeof syllabusNodeTypeSchema>;

// ─── AI Extraction Response ───

const baseSyllabusNodeSchema = z.object({
  title: z.string().min(1),
  type: syllabusNodeTypeSchema,
  depth: z.number().int().min(0),
  sort_order: z.number().int().min(0),
  description: z.string().optional(),
  content: z.string().optional(),
  key_terms: z.array(z.string()).default([]),
});

export type SyllabusNodeInput = z.infer<typeof baseSyllabusNodeSchema> & {
  children: SyllabusNodeInput[];
};

export const syllabusNodeSchema: z.ZodType<SyllabusNodeInput, z.ZodTypeDef, unknown> =
  baseSyllabusNodeSchema.extend({
    children: z.lazy(() => z.array(syllabusNodeSchema)),
  });

export const syllabusTreeSchema = z.object({
  nodes: z.array(syllabusNodeSchema).min(1),
});

export type SyllabusTree = z.infer<typeof syllabusTreeSchema>;

// ─── Upload / Processing Inputs ───

export const createSyllabusSchema = z.object({
  filename: z.string().min(1).max(255),
  examId: z.string().uuid(),
  mimeType: z.string().default("application/pdf"),
});

export type CreateSyllabus = z.infer<typeof createSyllabusSchema>;

export const processSyllabusSchema = z.object({
  syllabusId: z.number().int().positive(),
});

export type ProcessSyllabus = z.infer<typeof processSyllabusSchema>;

// ─── Tutorial Generation Input ───

export const generateTutorialInputSchema = z.object({
  nodeId: z.number().int().positive(),
  providers: z.array(aiProviderIdSchema).min(1),
  mode: z.enum(["single", "multi"]),
});

export type GenerateTutorialInput = z.infer<typeof generateTutorialInputSchema>;

// ─── MCQ Generation Input ───

export const generateMCQsInputSchema = z.object({
  nodeId: z.number().int().positive(),
  tutorialId: z.number().int().positive(),
  count: z.number().int().min(5).max(50).default(10),
  difficulty: z.enum(["mixed", "easy", "medium", "hard"]).default("mixed"),
  providers: z.array(aiProviderIdSchema).min(1),
});

export type GenerateMCQsInput = z.infer<typeof generateMCQsInputSchema>;

// ─── Exam Assembly Input ───

export const createExamFromNodesSchema = z.object({
  nodeIds: z.array(z.number().int().positive()).min(1),
  questionCount: z.number().int().min(5).max(200),
  timeLimitMinutes: z.number().int().min(5).max(300),
  difficultyMix: z
    .object({
      easy: z.number().min(0).max(100),
      medium: z.number().min(0).max(100),
      hard: z.number().min(0).max(100),
    })
    .optional(),
});

export type CreateExamFromNodes = z.infer<typeof createExamFromNodesSchema>;

// ─── Syllabus Processing Job Data ───

export const syllabusJobDataSchema = z.object({
  syllabusId: z.number().int().positive(),
  examId: z.string().uuid(),
  fileKey: z.string().min(1),
  userId: z.string().uuid(),
  examName: z.string().optional(),
});

export type SyllabusJobData = z.infer<typeof syllabusJobDataSchema>;
