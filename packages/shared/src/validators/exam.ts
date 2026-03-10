import { z } from "zod";

export const createExamSchema = z.object({
  name: z.string().min(3).max(255),
  category: z.string().min(1).max(100),
  subjects: z.array(z.string()).min(1),
});

export const updateExamSchema = createExamSchema.partial();

export const examSessionStartSchema = z.object({
  examId: z.string().uuid(),
  totalQuestions: z.number().int().min(1).max(200),
  durationMinutes: z.number().int().min(1).max(360).optional(),
});

export const examSessionSaveSchema = z.object({
  sessionId: z.string().uuid(),
  answers: z.record(z.string(), z.number()),
  flagged: z.array(z.string()).optional(),
});

export const examSessionSubmitSchema = z.object({
  sessionId: z.string().uuid(),
  answers: z.record(z.string(), z.number()),
});

export type CreateExam = z.infer<typeof createExamSchema>;
export type UpdateExam = z.infer<typeof updateExamSchema>;
export type ExamSessionStart = z.infer<typeof examSessionStartSchema>;
export type ExamSessionSave = z.infer<typeof examSessionSaveSchema>;
export type ExamSessionSubmit = z.infer<typeof examSessionSubmitSchema>;
