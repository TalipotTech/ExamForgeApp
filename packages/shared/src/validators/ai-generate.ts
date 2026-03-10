import { z } from "zod";
import { questionContentSchema } from "./question";

export const generateQuestionsInputSchema = z.object({
  provider: z.enum(["anthropic", "mistral"]),
  examId: z.string().uuid(),
  subject: z.string().min(1),
  topic: z.string().min(1),
  count: z.number().int().min(1).max(50),
  difficulty: z.enum(["easy", "medium", "hard"]),
  questionType: z.enum(["mcq", "true_false", "fill_blank", "match", "assertion"]),
  customPrompt: z.string().optional(),
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
