import { z } from "zod";

export const doubtStatusSchema = z.enum(["open", "ai_answered", "creator_answered", "closed"]);
export type DoubtStatus = z.infer<typeof doubtStatusSchema>;

export const askDoubtSchema = z.object({
  questionText: z.string().min(5).max(4000),
  creatorId: z.string().uuid().optional(),
  contentId: z.string().uuid().optional(),
  classroomId: z.string().uuid().optional(),
  syllabusNodeId: z.number().int().positive().optional(),
  isPublic: z.boolean().default(true),
  images: z
    .array(
      z.object({
        url: z.string().url().max(1000),
        caption: z.string().max(255).optional(),
      }),
    )
    .max(5)
    .optional(),
});
export type AskDoubtInput = z.infer<typeof askDoubtSchema>;

export const respondToDoubtSchema = z.object({
  doubtId: z.string().uuid(),
  responseText: z.string().min(1).max(10000),
  markAsAnswered: z.boolean().default(true),
});
export type RespondToDoubtInput = z.infer<typeof respondToDoubtSchema>;

export const doubtIdInputSchema = z.object({ doubtId: z.string().uuid() });
export type DoubtIdInput = z.infer<typeof doubtIdInputSchema>;

export const classroomDoubtsInputSchema = z.object({
  classroomId: z.string().uuid(),
  status: doubtStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(30),
});
export type ClassroomDoubtsInput = z.infer<typeof classroomDoubtsInputSchema>;

export const myDoubtsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  status: doubtStatusSchema.optional(),
});
export type MyDoubtsInput = z.infer<typeof myDoubtsInputSchema>;
