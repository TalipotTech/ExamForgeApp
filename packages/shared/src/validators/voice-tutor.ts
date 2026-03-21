import { z } from "zod";

export const voiceTutorModeSchema = z.enum(["recap", "fresh_exam", "teacher"]);
export type VoiceTutorMode = z.infer<typeof voiceTutorModeSchema>;

export const startVoiceSessionSchema = z.object({
  mode: voiceTutorModeSchema,
  examId: z.string().uuid(),
  sourceSessionId: z.string().uuid().optional(),
  sourceUserExamId: z.string().optional(),
  subject: z.string().optional(),
  topic: z.string().optional(),
  questionCount: z.number().min(5).max(50).default(10),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
});
export type StartVoiceSession = z.infer<typeof startVoiceSessionSchema>;

export const submitVoiceAnswerSchema = z.object({
  sessionId: z.string().uuid(),
  questionIndex: z.number().min(0),
  selectedIndex: z.number().min(0).max(3),
  spokenTranscript: z.string(),
  responseTimeMs: z.number(),
});
export type SubmitVoiceAnswer = z.infer<typeof submitVoiceAnswerSchema>;

export const teacherRespondSchema = z.object({
  sessionId: z.string().uuid(),
  userMessage: z.string().min(1),
  currentQuestionContext: z.string().optional(),
});
export type TeacherRespond = z.infer<typeof teacherRespondSchema>;

export const completeVoiceSessionSchema = z.object({
  sessionId: z.string().uuid(),
  durationSeconds: z.number().min(0),
});
export type CompleteVoiceSession = z.infer<typeof completeVoiceSessionSchema>;

export const listVoiceSessionsSchema = z.object({
  examId: z.string().uuid().optional(),
  mode: z.string().optional(),
  limit: z.number().min(1).max(50).default(10),
});
export type ListVoiceSessions = z.infer<typeof listVoiceSessionsSchema>;

export const getVoiceSessionSchema = z.object({
  id: z.string().uuid(),
});
export type GetVoiceSession = z.infer<typeof getVoiceSessionSchema>;

export const teacherResponseSchema = z.object({
  tutorResponse: z.string(),
  nextQuestion: z
    .object({
      question: z.string(),
      options: z.array(z.string()).length(4),
      correctIndex: z.number().min(0).max(3),
      explanation: z.string(),
      difficulty: z.enum(["easy", "medium", "hard"]),
      subject: z.string(),
    })
    .nullable(),
  shouldAskQuestion: z.boolean(),
  adaptedDifficulty: z.enum(["easy", "medium", "hard"]),
});
export type TeacherResponse = z.infer<typeof teacherResponseSchema>;
