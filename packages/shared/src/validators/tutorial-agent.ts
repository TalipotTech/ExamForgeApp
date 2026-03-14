import { z } from "zod";
import { aiProviderIdSchema } from "./syllabus";

// ─── Admin: Start Generation ───

export const startTutorialGenerationSchema = z.object({
  syllabusId: z.number().int().positive(),
  examId: z.string().uuid(),
  providers: z.array(aiProviderIdSchema).default(["claude"]),
  generatePreviews: z.boolean().default(true),
  previewPercentage: z.number().int().min(10).max(50).default(30),
  includeDiagrams: z.boolean().default(true),
  includeMnemonics: z.boolean().default(true),
  includeReferences: z.boolean().default(true),
});

export type StartTutorialGeneration = z.infer<typeof startTutorialGenerationSchema>;

// ─── Admin: Job Control ───

export const tutorialJobIdSchema = z.object({
  jobId: z.number().int().positive(),
});

export type TutorialJobId = z.infer<typeof tutorialJobIdSchema>;

// ─── Admin: Regenerate Single Topic ───

export const regenerateTopicSchema = z.object({
  tutorialFileId: z.number().int().positive(),
  providers: z.array(aiProviderIdSchema).default(["claude"]),
});

export type RegenerateTopic = z.infer<typeof regenerateTopicSchema>;

// ─── User: Get Tutorial ───

export const getTutorialForNodeSchema = z.object({
  syllabusNodeId: z.number().int().positive(),
});

export type GetTutorialForNode = z.infer<typeof getTutorialForNodeSchema>;

// ─── User: List Tutorials ───

export const listTutorialsForSyllabusSchema = z.object({
  syllabusId: z.number().int().positive(),
});

export type ListTutorialsForSyllabus = z.infer<typeof listTutorialsForSyllabusSchema>;

// ─── User: Generate Exam from Tutorial ───

export const generateUserExamSchema = z.object({
  syllabusNodeId: z.number().int().positive(),
  tutorialFileId: z.number().int().positive(),
  questionCount: z.number().int().min(5).max(50).default(10),
  difficulty: z.enum(["mixed", "easy", "medium", "hard"]).default("mixed"),
  timeLimitMinutes: z.number().int().min(5).max(120).optional(),
  providers: z.array(aiProviderIdSchema).default(["claude"]),
});

export type GenerateUserExam = z.infer<typeof generateUserExamSchema>;

// ─── User: List/Get/Delete Exams ───

export const listUserExamsSchema = z.object({
  examId: z.string().uuid().optional(),
  syllabusNodeId: z.number().int().positive().optional(),
});

export type ListUserExams = z.infer<typeof listUserExamsSchema>;

export const getUserExamByIdSchema = z.object({
  id: z.number().int().positive(),
});

export type GetUserExamById = z.infer<typeof getUserExamByIdSchema>;

export const deleteUserExamSchema = z.object({
  id: z.number().int().positive(),
});

export type DeleteUserExam = z.infer<typeof deleteUserExamSchema>;

// ─── Worker: Tutorial Agent Job Data ───

export const tutorialAgentJobDataSchema = z.object({
  jobId: z.number().int().positive(),
  syllabusId: z.number().int().positive(),
  examId: z.string().uuid(),
  providers: z.array(z.string()).default(["claude"]),
  generatePreviews: z.boolean().default(true),
  previewPercentage: z.number().int().default(30),
  includeDiagrams: z.boolean().default(true),
  includeMnemonics: z.boolean().default(true),
  includeReferences: z.boolean().default(true),
  userId: z.string().uuid(),
});

export type TutorialAgentJobData = z.infer<typeof tutorialAgentJobDataSchema>;
