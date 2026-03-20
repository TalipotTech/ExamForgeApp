import { z } from "zod";
import { questionContentSchema } from "./question";

export const aiProviderEnum = z.enum(["anthropic", "mistral", "openai", "google", "perplexity"]);

export const generateQuestionsInputSchema = z.object({
  provider: aiProviderEnum,
  examId: z.string().uuid().optional(),
  examName: z.string().min(1).optional(),
  subject: z.string().min(1),
  topic: z.string().min(1),
  count: z.number().int().min(1).max(50),
  difficulty: z.enum(["easy", "medium", "hard"]),
  questionType: z.enum(["mcq", "true_false", "fill_blank", "match", "assertion"]),
  customPrompt: z.string().optional(),
  syllabusContext: z.string().optional(),
  existingQuestionTexts: z.array(z.string()).max(100).optional(),
  syllabusId: z.number().int().optional(),
  syllabusName: z.string().optional(),
  syllabusNodeId: z.number().int().optional(),
  topicName: z.string().optional(),
});

export const generatedQuestionSchema = z.object({
  content: questionContentSchema,
  subject: z.string(),
  topic: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export const generatedQuestionsResponseSchema = z.object({
  questions: z.array(generatedQuestionSchema),
});

export type GenerateQuestionsInput = z.infer<typeof generateQuestionsInputSchema>;
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
export type GeneratedQuestionsResponse = z.infer<typeof generatedQuestionsResponseSchema>;
