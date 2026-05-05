import { z } from "zod";

export const assignmentAttachmentSchema = z.object({
  attachmentUrl: z.string().min(1).max(2000),
  attachmentFileName: z.string().min(1).max(500),
  attachmentMimeType: z.string().min(1).max(100),
});
export type AssignmentAttachmentInput = z.infer<typeof assignmentAttachmentSchema>;

export const createAssignmentSchema = z.object({
  classroomId: z.string().uuid(),
  title: z.string().min(2).max(500),
  instructions: z.string().max(10_000).optional(),
  dueAt: z.coerce.date().optional(),
  attachmentUrl: z.string().min(1).max(2000).optional(),
  attachmentFileName: z.string().min(1).max(500).optional(),
  attachmentMimeType: z.string().min(1).max(100).optional(),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  title: z.string().min(2).max(500).optional(),
  instructions: z.string().max(10_000).nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  attachmentUrl: z.string().min(1).max(2000).nullable().optional(),
  attachmentFileName: z.string().min(1).max(500).nullable().optional(),
  attachmentMimeType: z.string().min(1).max(100).nullable().optional(),
});
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

export const assignmentIdInputSchema = z.object({
  assignmentId: z.string().uuid(),
});
export type AssignmentIdInput = z.infer<typeof assignmentIdInputSchema>;

export const submitAssignmentSchema = z
  .object({
    assignmentId: z.string().uuid(),
    submissionText: z.string().max(50_000).optional(),
    submissionUrl: z.string().min(1).max(2000).optional(),
    submissionFileName: z.string().min(1).max(500).optional(),
    submissionMimeType: z.string().min(1).max(100).optional(),
  })
  .refine(
    (v) =>
      (v.submissionText && v.submissionText.trim().length > 0) ||
      (v.submissionUrl && v.submissionUrl.length > 0),
    { message: "Provide submission text or upload a file" },
  );
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;

export const gradeSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  score: z.number().min(0).max(100),
  feedback: z.string().max(10_000).optional(),
});
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
