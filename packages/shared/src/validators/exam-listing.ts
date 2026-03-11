import { z } from "zod";

export const examListingFilterSchema = z.object({
  category: z.string().max(100).optional(),
  status: z.enum(["upcoming", "active", "past", "draft"]).optional(),
  level: z.enum(["national", "state", "university", "institutional"]).optional(),
  search: z.string().max(200).optional(),
  sort: z.enum(["date", "popularity", "questions", "name"]).default("date"),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(12),
});

export type ExamListingFilter = z.infer<typeof examListingFilterSchema>;

export const updateExamAdminSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(3).max(255).optional(),
  category: z.string().min(1).max(100).optional(),
  subjects: z.array(z.string()).optional(),
  status: z.enum(["upcoming", "active", "past", "draft"]).optional(),
  examDate: z.string().datetime().nullable().optional(),
  registrationStart: z.string().datetime().nullable().optional(),
  registrationEnd: z.string().datetime().nullable().optional(),
  resultDate: z.string().datetime().nullable().optional(),
  officialUrl: z.string().url().max(1000).nullable().optional(),
  applicationUrl: z.string().url().max(1000).nullable().optional(),
  syllabusUrl: z.string().url().max(1000).nullable().optional(),
  conductingBody: z.string().max(255).nullable().optional(),
  level: z.enum(["national", "state", "university", "institutional"]).optional(),
  eligibility: z.string().max(2000).nullable().optional(),
  totalMarks: z.number().int().positive().nullable().optional(),
  durationMinutes: z.number().int().positive().nullable().optional(),
  negativeMarking: z.boolean().optional(),
  negativeMarkingScheme: z.string().max(100).nullable().optional(),
  examPattern: z
    .object({
      marks: z.number().optional(),
      duration: z.number().optional(),
      negative: z.boolean().optional(),
      sections: z
        .array(
          z.object({
            name: z.string(),
            questions: z.number(),
            marks: z.number(),
          }),
        )
        .optional(),
    })
    .nullable()
    .optional(),
  tags: z.array(z.string()).optional(),
  isFeatured: z.boolean().optional(),
});

export type UpdateExamAdmin = z.infer<typeof updateExamAdminSchema>;

export const examNotificationSchema = z.object({
  examId: z.string().uuid(),
  type: z.enum([
    "date_change",
    "syllabus_update",
    "registration_open",
    "result_declared",
    "new_exam",
    "pattern_change",
    "admit_card",
    "correction_window",
  ]),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  sourceUrl: z.string().url().max(1000).optional(),
  isImportant: z.boolean().default(false),
});

export type ExamNotification = z.infer<typeof examNotificationSchema>;

// ─── Discovery Agent AI Response Schemas ───

export const discoveredExamSchema = z.object({
  name: z.string().min(3).max(255),
  category: z.string().max(100),
  conductingBody: z.string().max(255).optional(),
  level: z.enum(["national", "state", "university", "institutional"]).optional(),
  status: z.enum(["upcoming", "active", "past", "draft"]).optional(),
  examDate: z.string().optional(),
  registrationStart: z.string().optional(),
  registrationEnd: z.string().optional(),
  resultDate: z.string().optional(),
  dateConfidence: z.enum(["confirmed", "approximate", "inferred", "unknown"]).optional(),
  officialUrl: z.string().url().max(1000).optional(),
  applicationUrl: z.string().url().max(1000).optional(),
  syllabusUrl: z.string().url().max(1000).optional(),
  eligibility: z.string().max(2000).optional(),
  totalMarks: z.number().int().positive().optional(),
  durationMinutes: z.number().int().positive().optional(),
  negativeMarking: z.boolean().optional(),
  negativeMarkingScheme: z.string().max(100).optional(),
  subjects: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export type DiscoveredExam = z.infer<typeof discoveredExamSchema>;

export const discoveredNotificationSchema = z.object({
  examName: z.string(),
  type: z.enum([
    "date_change",
    "syllabus_update",
    "registration_open",
    "result_declared",
    "new_exam",
    "pattern_change",
    "admit_card",
    "correction_window",
  ]),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  sourceUrl: z.string().url().max(1000).optional(),
  isImportant: z.boolean().default(false),
});

export type DiscoveredNotification = z.infer<typeof discoveredNotificationSchema>;

export const discoveryAgentResponseSchema = z.object({
  exams: z.array(discoveredExamSchema),
  notifications: z.array(discoveredNotificationSchema),
  portalRelevance: z.enum(["high", "medium", "low", "none"]),
});

export type DiscoveryAgentResponse = z.infer<typeof discoveryAgentResponseSchema>;

export const sourceAnalysisResponseSchema = z.object({
  isQuestionSource: z.boolean(),
  estimatedQuestions: z.number().int().min(0),
  subjectsFound: z.array(z.string()),
  questionTypes: z.array(z.string()),
  contentQuality: z.enum(["high", "medium", "low"]),
  suggestedSelector: z.string().nullable(),
  suggestedDepth: z.number().int().min(1).max(10),
  suggestedPatterns: z.array(z.string()),
  notes: z.string(),
});

export type SourceAnalysisResponse = z.infer<typeof sourceAnalysisResponseSchema>;

// ─── Discovery Agent Input Schema ───

export const runDiscoveryInputSchema = z.object({
  portals: z.array(z.string().url()).min(1).max(20).optional(),
  aiProvider: z.enum(["auto", "anthropic", "openai", "google", "mistral"]).default("auto"),
  maxPagesPerPortal: z.number().int().min(1).max(10).default(3),
  crawlerType: z.enum(["cheerio", "playwright", "auto"]).default("auto"),
});

export type RunDiscoveryInput = z.infer<typeof runDiscoveryInputSchema>;
