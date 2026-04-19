import { z } from "zod";

// ─── Question Style Classification ───

export const questionStyleEnum = z.enum([
  "direct_recall",
  "choose_correct",
  "choose_incorrect",
  "match_following",
  "assertion_reason",
  "clinical_case",
  "calculation",
  "classification",
  "sequence_order",
  "fill_blank",
  "image_based",
  "current_affairs",
  "definition",
  "comparison",
  "true_false_combo",
]);

export type QuestionStyle = z.infer<typeof questionStyleEnum>;

// ─── AI Output: Classified Question ───

export const classifiedQuestionSchema = z.object({
  questionId: z.string().uuid(),
  analyzedSubject: z.string().min(1),
  analyzedTopic: z.string().min(1),
  analyzedSubtopic: z.string().optional(),
  analyzedStyle: questionStyleEnum,
  difficulty: z.enum(["easy", "medium", "hard"]),
  patternTags: z.array(z.string()).default([]),
});

export type ClassifiedQuestion = z.infer<typeof classifiedQuestionSchema>;

export const classifiedQuestionsResponseSchema = z.object({
  questions: z.array(classifiedQuestionSchema),
});

export type ClassifiedQuestionsResponse = z.infer<typeof classifiedQuestionsResponseSchema>;

// ─── Exam Fingerprint Schema ───

export const subjectWeightageSchema = z.object({
  subject: z.string(),
  averagePercent: z.number(),
  minPercent: z.number(),
  maxPercent: z.number(),
  questionCount: z.number(),
});

export const topicFrequencySchema = z.object({
  subject: z.string(),
  topic: z.string(),
  appearsInPercent: z.number(),
  avgQuestionsPerPaper: z.number(),
  importance: z.enum(["must_study", "high", "medium", "low"]),
});

export const difficultyDistributionSchema = z.object({
  easy: z.number(),
  medium: z.number(),
  hard: z.number(),
});

export const styleDistributionSchema = z.object({
  style: questionStyleEnum,
  percent: z.number(),
});

export const repeatAnalysisSchema = z.object({
  overallRepeatRate: z.number(),
  topRepeatedTopics: z.array(z.string()),
  commonRepeatedQuestions: z.array(
    z.object({
      question: z.string(),
      appearedIn: z.array(z.string()),
    }),
  ),
});

export const languagePatternsSchema = z.object({
  negativeQuestionPercent: z.number(),
  allOfAbovePercent: z.number(),
  noneOfAbovePercent: z.number(),
  commonPhrases: z.array(z.string()),
});

export const sectionStructureSchema = z.object({
  name: z.string(),
  questionRange: z.tuple([z.number(), z.number()]),
  subjectFocus: z.array(z.string()),
});

export const examFingerprintSchema = z.object({
  examId: z.string(),
  examName: z.string(),
  conductingBody: z.string(),
  papersAnalyzed: z.number(),
  confidence: z.number().min(0).max(1),
  structure: z.object({
    totalQuestions: z.number(),
    totalMarks: z.number(),
    durationMinutes: z.number(),
    negativeMarking: z.boolean(),
    negativeScheme: z.string(),
    sections: z.array(sectionStructureSchema),
  }),
  subjectWeightage: z.array(subjectWeightageSchema),
  topicFrequency: z.array(topicFrequencySchema),
  difficultyDistribution: difficultyDistributionSchema,
  styleDistribution: z.array(styleDistributionSchema),
  repeatAnalysis: repeatAnalysisSchema,
  languagePatterns: languagePatternsSchema,
  generatedAt: z.string(),
  paperYearsIncluded: z.array(z.number()),
});

export type ExamFingerprintInput = z.infer<typeof examFingerprintSchema>;

// ─── tRPC Input Schemas ───

export const classifyPaperInputSchema = z.object({
  examId: z.string().uuid(),
  portalDocumentId: z.string().uuid().optional(),
  paperYear: z.number().int().optional(),
});

export const analyzePatternInputSchema = z.object({
  examId: z.string().uuid(),
  forceReanalyze: z.boolean().optional().default(false),
});

export const getPatternInputSchema = z.object({
  examId: z.string().uuid(),
});

export const getPaperAnalysisInputSchema = z.object({
  examId: z.string().uuid(),
});

export const generatePatternExamInputSchema = z.object({
  examId: z.string().uuid(),
  questionCount: z.number().int().min(10).max(200).default(100),
  includeRepeats: z.boolean().default(true),
  includeCurrentAffairs: z.boolean().default(true),
  yearFocus: z.number().int().optional(),
});

export const getTopicPredictionsInputSchema = z.object({
  examId: z.string().uuid(),
  topN: z.number().int().min(5).max(50).default(20),
});

export const getRepeatCandidatesInputSchema = z.object({
  examId: z.string().uuid(),
  limit: z.number().int().min(10).max(100).default(50),
});

export const getClassificationStatusInputSchema = z.object({
  examId: z.string().uuid(),
});

// ─── Pattern Generation AI Output ───

export const patternGeneratedQuestionSchema = z.object({
  question: z.string().min(10),
  options: z.array(z.string()).length(4),
  answer: z.number().min(0).max(3),
  explanation: z.string().min(20),
  subject: z.string(),
  topic: z.string(),
  style: questionStyleEnum,
  difficulty: z.enum(["easy", "medium", "hard"]),
  questionNumber: z.number().int(),
  section: z.string().optional(),
  isRepeatCandidate: z.boolean().default(false),
});

export const patternGeneratedExamSchema = z.object({
  questions: z.array(patternGeneratedQuestionSchema),
});

export type PatternGeneratedExam = z.infer<typeof patternGeneratedExamSchema>;
