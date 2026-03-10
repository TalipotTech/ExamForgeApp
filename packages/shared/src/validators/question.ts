import { z } from "zod";

export const mcqContentSchema = z.object({
  type: z.literal("mcq"),
  question: z.string().min(10),
  options: z.array(z.string()).length(4),
  answer: z.number().min(0).max(3),
  explanation: z.string().min(20),
});

export const trueFalseContentSchema = z.object({
  type: z.literal("true_false"),
  question: z.string().min(10),
  answer: z.boolean(),
  explanation: z.string().min(20),
});

export const fillBlankContentSchema = z.object({
  type: z.literal("fill_blank"),
  question: z.string().min(10),
  answer: z.string().min(1),
  acceptableAnswers: z.array(z.string()).optional(),
  explanation: z.string().min(20),
});

export const matchContentSchema = z.object({
  type: z.literal("match"),
  question: z.string().min(10),
  pairs: z.array(z.object({ left: z.string(), right: z.string() })).min(2),
  explanation: z.string().min(20),
});

export const assertionContentSchema = z.object({
  type: z.literal("assertion"),
  assertion: z.string().min(10),
  reason: z.string().min(10),
  answer: z.enum([
    "both_true_reason_correct",
    "both_true_reason_incorrect",
    "assertion_true_reason_false",
    "both_false",
  ]),
  explanation: z.string().min(20),
});

export const questionContentSchema = z.discriminatedUnion("type", [
  mcqContentSchema,
  trueFalseContentSchema,
  fillBlankContentSchema,
  matchContentSchema,
  assertionContentSchema,
]);

export const createQuestionSchema = z.object({
  examId: z.string().uuid(),
  content: questionContentSchema,
  subject: z.string().min(1),
  topic: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  source: z.string().optional(),
});

export type McqContent = z.infer<typeof mcqContentSchema>;
export type TrueFalseContent = z.infer<typeof trueFalseContentSchema>;
export type FillBlankContent = z.infer<typeof fillBlankContentSchema>;
export type MatchContent = z.infer<typeof matchContentSchema>;
export type AssertionContent = z.infer<typeof assertionContentSchema>;
export type QuestionContent = z.infer<typeof questionContentSchema>;
export type CreateQuestion = z.infer<typeof createQuestionSchema>;
