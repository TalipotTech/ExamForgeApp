import { z } from "zod";

export const billingCycleSchema = z.enum(["monthly", "quarterly", "yearly", "one_time"]);
export type BillingCycle = z.infer<typeof billingCycleSchema>;

export const classroomSettingsSchema = z.object({
  allowDoubts: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  showLeaderboard: z.boolean().optional(),
  autoAssignContent: z.boolean().optional(),
});
export type ClassroomSettingsInput = z.infer<typeof classroomSettingsSchema>;

export const classroomScheduleSchema = z.object({
  days: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).optional(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be HH:MM")
    .optional(),
  timezone: z.string().max(64).optional(),
});
export type ClassroomScheduleInput = z.infer<typeof classroomScheduleSchema>;

export const createClassroomSchema = z.object({
  name: z.string().min(3).max(255),
  description: z.string().max(2000).optional(),
  examId: z.string().uuid().optional(),
  subject: z.string().max(255).optional(),
  maxStudents: z.number().int().min(1).max(5000).default(100),
  isPaid: z.boolean().default(false),
  feeInr: z.number().int().min(0).optional(),
  billingCycle: billingCycleSchema.optional(),
  academicYear: z.string().max(10).optional(),
  settings: classroomSettingsSchema.optional(),
  schedule: classroomScheduleSchema.optional(),
});
export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;

export const updateClassroomSchema = createClassroomSchema.partial().extend({
  classroomId: z.string().uuid(),
});
export type UpdateClassroomInput = z.infer<typeof updateClassroomSchema>;

export const classroomIdInputSchema = z.object({ classroomId: z.string().uuid() });
export type ClassroomIdInput = z.infer<typeof classroomIdInputSchema>;

export const joinClassroomByCodeSchema = z.object({
  joinCode: z
    .string()
    .min(4)
    .max(10)
    .transform((v) => v.trim().toUpperCase()),
});
export type JoinClassroomByCodeInput = z.infer<typeof joinClassroomByCodeSchema>;

export const assignContentToClassroomSchema = z.object({
  classroomId: z.string().uuid(),
  contentId: z.string().uuid(),
});
export type AssignContentToClassroomInput = z.infer<typeof assignContentToClassroomSchema>;

export const removeMemberSchema = z.object({
  classroomId: z.string().uuid(),
  studentId: z.string().uuid(),
});
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;
