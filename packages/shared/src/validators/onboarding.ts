import { z } from "zod";

export const saveSelectedExamsSchema = z.object({
  exams: z
    .array(
      z.object({
        examId: z.string().uuid(),
        targetScore: z.number().int().min(0).max(100).optional(),
        priority: z.number().int().min(1).max(10).optional(),
      }),
    )
    .min(1, "Select at least one exam")
    .max(10),
});
export type SaveSelectedExams = z.infer<typeof saveSelectedExamsSchema>;

export const getOnboardingStatusSchema = z.object({});
export type GetOnboardingStatus = z.infer<typeof getOnboardingStatusSchema>;
