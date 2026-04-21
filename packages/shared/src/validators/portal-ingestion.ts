import { z } from "zod";

// ─── Input: Admin triggers portal ingestion ───

export const ingestPortalSchema = z.object({
  url: z.string().url(),
  portalName: z.string().min(1),
  pageType: z.enum([
    "examinations",
    "previous_questions",
    "omr_answer_key",
    "online_answer_key",
    "descriptive_questions",
    "syllabus",
    "notification",
  ]),
  examId: z.string().uuid().optional(),
});

export type IngestPortal = z.infer<typeof ingestPortalSchema>;

// ─── Input: Admin ingests a single direct PDF (bypasses discovery) ───
// Used by /scraper/ingest's "Ingest a single paper" card for cases
// where the portal's listing page doesn't surface the paper (e.g.
// Kerala PSC Assistant Professor answer-key PDFs which only live on
// post-level slug pages). Creates ONE portal_documents row + queues
// processing directly.
export const ingestDirectPdfSchema = z.object({
  pdfUrl: z.string().url(),
  examId: z.string().uuid(),
  title: z.string().min(1).max(500),
  examName: z.string().min(1).max(500).optional(),
  examYear: z.number().int().min(1990).max(2100).optional(),
  paperNumber: z.string().max(50).optional(),
  // Document type — defaults to "question_paper_mcq". Other values
  // used by the PDF processor: "answer_key_online", "descriptive".
  documentType: z
    .enum(["question_paper_mcq", "answer_key_online", "descriptive_questions"])
    .default("question_paper_mcq"),
  // When true, extracted questions get answer_source='official_key'
  // (the highest-trust tier — Layer 2 verification skips them).
  isOfficialAnswerKey: z.boolean().default(false),
  // Portal label shown in the UI — "Kerala PSC (direct)" by default.
  portalName: z.string().min(1).max(120).default("Direct Upload"),
});

export type IngestDirectPdf = z.infer<typeof ingestDirectPdfSchema>;

// ─── AI Output: Structured entry from a portal page ───

export const portalPageEntrySchema = z.object({
  examName: z.string(),
  examCategory: z.string().optional(),
  examYear: z.number().optional(),
  date: z.string().optional(),
  pdfLinks: z.array(
    z.object({
      url: z.string(),
      label: z.string(),
      type: z.enum(["question_paper", "answer_key", "syllabus", "notification", "other"]),
    }),
  ),
  additionalInfo: z.string().optional(),
});

export type PortalPageEntry = z.infer<typeof portalPageEntrySchema>;

// ─── AI Output: Answer key from PDF ───

export const answerKeySchema = z.object({
  series: z.string(),
  answers: z.array(
    z.object({
      questionNumber: z.number(),
      answer: z.number(), // 0-3 or -2 for cancelled
    }),
  ),
});

export type AnswerKey = z.infer<typeof answerKeySchema>;

// ─── AI Output: Descriptive question from PDF ───

export const descriptiveQuestionSchema = z.object({
  questionNumber: z.number(),
  question: z.string(),
  marks: z.number(),
  section: z.string().optional(),
  type: z.enum(["essay", "short_answer", "problem", "case_study"]),
  subject: z.string(),
  subQuestions: z
    .array(
      z.object({
        label: z.string(),
        question: z.string(),
        marks: z.number(),
      }),
    )
    .optional(),
});

export type DescriptiveQuestion = z.infer<typeof descriptiveQuestionSchema>;

// ─── AI Output: MCQ extracted from question paper PDF ───

export const portalMCQSchema = z.object({
  questionNumber: z.number(),
  question: z.string().min(5),
  options: z.array(z.string()).length(4),
  answer: z.number().min(-1).max(3), // -1 = unknown
  subject: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

export type PortalMCQ = z.infer<typeof portalMCQSchema>;

// ─── Query filters for portal documents ───

export const portalDocumentFilterSchema = z.object({
  portalName: z.string().optional(),
  documentType: z.string().optional(),
  processingStatus: z.string().optional(),
  sourcePageType: z.string().optional(),
  examId: z.string().uuid().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export type PortalDocumentFilter = z.infer<typeof portalDocumentFilterSchema>;

// ─── Admin action: Process selected documents ───

export const processDocumentsSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1).max(100),
});

export type ProcessDocuments = z.infer<typeof processDocumentsSchema>;

// ─── Admin action: Approve staged questions ───

export const approveQuestionsSchema = z.object({
  stagedQuestionIds: z.array(z.string().uuid()).min(1).max(500),
  examId: z.string().uuid(),
});

export type ApproveQuestions = z.infer<typeof approveQuestionsSchema>;

// ─── Admin action: Reject staged questions ───

export const rejectQuestionsSchema = z.object({
  stagedQuestionIds: z.array(z.string().uuid()).min(1),
  reason: z.string().optional(),
});

export type RejectQuestions = z.infer<typeof rejectQuestionsSchema>;

// ─── Admin action: Map document to exam ───

export const mapExamSchema = z.object({
  documentId: z.string().uuid(),
  examId: z.string().uuid().optional(),
  createExam: z
    .object({
      name: z.string().min(1),
      conductingBody: z.string().min(1),
      category: z.string().min(1),
    })
    .optional(),
});

export type MapExam = z.infer<typeof mapExamSchema>;

// ─── Query filters for staged questions ───

export const stagedQuestionFilterSchema = z.object({
  portalDocumentId: z.string().uuid().optional(),
  examId: z.string().uuid().optional(),
  reviewStatus: z.enum(["pending", "approved", "rejected", "duplicate"]).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
});

export type StagedQuestionFilter = z.infer<typeof stagedQuestionFilterSchema>;
