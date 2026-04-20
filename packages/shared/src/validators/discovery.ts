/**
 * Universal Discovery Agent v2 — Validators
 *
 * Structured-output schemas for the universal page parser AI prompt.
 * One prompt produces `DiscoveryPageResult`; the worker validates and
 * persists the items into `exams`, `exam_notifications`, and queues
 * downstream document-download jobs.
 */

import { z } from "zod";

// ─── Shared enums ─────────────────────────────────────

export const discoveryItemCategorySchema = z.enum([
  "pharmacy",
  "medical",
  "engineering",
  "civil_services",
  "state_psc",
  "teaching",
  "other",
]);
export type DiscoveryItemCategory = z.infer<typeof discoveryItemCategorySchema>;

export const discoveryLinkTypeSchema = z.enum([
  "notification_pdf",
  "question_paper",
  "answer_key",
  "syllabus",
  "application",
  "result",
  "other",
]);
export type DiscoveryLinkType = z.infer<typeof discoveryLinkTypeSchema>;

export const discoveryLinkFormatSchema = z.enum(["pdf", "html", "external"]);
export type DiscoveryLinkFormat = z.infer<typeof discoveryLinkFormatSchema>;

export const discoveryLinkLanguageSchema = z.enum([
  "english",
  "hindi",
  "malayalam",
  "tamil",
  "telugu",
  "kannada",
  "bilingual",
  "other",
]);
export type DiscoveryLinkLanguage = z.infer<typeof discoveryLinkLanguageSchema>;

export const discoveryItemStatusSchema = z.enum([
  "upcoming",
  "registration_open",
  "admit_card_out",
  "exam_conducted",
  "result_declared",
  "cancelled",
  "postponed",
]);
export type DiscoveryItemStatus = z.infer<typeof discoveryItemStatusSchema>;

export const pageTypeSchema = z.enum([
  "notifications",
  "exam_calendar",
  "previous_papers",
  "answer_keys",
  "syllabus",
  "results",
  "general",
]);
export type DiscoveryPageType = z.infer<typeof pageTypeSchema>;

// ─── Nested shapes ────────────────────────────────────

export const discoveryDatesSchema = z.object({
  notification: z.string().nullable().optional(),
  applicationStart: z.string().nullable().optional(),
  applicationEnd: z.string().nullable().optional(),
  examDate: z.string().nullable().optional(),
  admitCard: z.string().nullable().optional(),
  answerKey: z.string().nullable().optional(),
  result: z.string().nullable().optional(),
});
export type DiscoveryDates = z.infer<typeof discoveryDatesSchema>;

export const discoveryLinkSchema = z.object({
  url: z.string(),
  label: z.string().default(""),
  type: discoveryLinkTypeSchema.default("other"),
  format: discoveryLinkFormatSchema.default("html"),
  language: discoveryLinkLanguageSchema.default("english"),
});
export type DiscoveryLink = z.infer<typeof discoveryLinkSchema>;

// ─── Main item ─────────────────────────────────────────

export const discoveredItemSchema = z.object({
  /** Full title as it appears on the page. */
  title: z.string(),
  /** Normalized canonical exam name (e.g. "NEET UG 2026"). */
  examName: z.string(),
  /** Conducting authority if visible on the page. */
  conductingBody: z.string().nullable().optional(),
  category: discoveryItemCategorySchema.nullable().optional(),
  /** Exam year if mentioned, else null. */
  year: z.number().int().min(2000).max(2100).nullable().optional(),

  /** Any dates the AI extracted, each ISO or null. */
  dates: discoveryDatesSchema.optional().default({}),

  /** Hyperlinks extracted from this item (notification PDFs, application, etc.). */
  links: z.array(discoveryLinkSchema).default([]),

  eligibility: z.string().nullable().optional(),
  examPattern: z.string().nullable().optional(),
  status: discoveryItemStatusSchema.nullable().optional(),

  /** AI's best guess whether this is a newly-announced item. */
  isNew: z.boolean().nullable().optional(),

  /** Original snippet from the page — kept for admin debugging and audit. */
  rawText: z.string().nullable().optional(),
});
export type DiscoveredItem = z.infer<typeof discoveredItemSchema>;

// ─── Pagination + metadata ─────────────────────────────

export const discoveryPaginationSchema = z.object({
  hasMore: z.boolean().default(false),
  nextPageUrl: z.string().nullable().optional(),
  totalPages: z.number().int().nullable().optional(),
});
export type DiscoveryPagination = z.infer<typeof discoveryPaginationSchema>;

export const discoveryPageMetadataSchema = z.object({
  lastUpdated: z.string().nullable().optional(),
  totalItemsOnPage: z.number().int().nullable().optional(),
  contentLanguage: z.enum(["english", "bilingual", "other"]).nullable().optional(),
});
export type DiscoveryPageMetadata = z.infer<typeof discoveryPageMetadataSchema>;

// ─── Top-level result ──────────────────────────────────

export const discoveryPageResultSchema = z.object({
  items: z.array(discoveredItemSchema).default([]),
  pagination: discoveryPaginationSchema.optional(),
  pageMetadata: discoveryPageMetadataSchema.optional(),
});
export type DiscoveryPageResult = z.infer<typeof discoveryPageResultSchema>;

// ─── Per-exam content completeness (stored on exams.contentCompleteness JSONB) ─

export const examContentCompletenessSchema = z.object({
  previousPapersFound: z.number().int().default(0),
  previousPapersYears: z.array(z.number().int()).default([]),
  answerKeysFound: z.number().int().default(0),
  answeredPapersCount: z.number().int().default(0),

  syllabusFound: z.boolean().default(false),
  syllabusProcessed: z.boolean().default(false),

  papersClassified: z.number().int().default(0),
  patternGenerated: z.boolean().default(false),
  patternConfidence: z.number().min(0).max(1).default(0),

  missingPaperYears: z.array(z.number().int()).default([]),
  needsAnswerKeys: z.array(z.number().int()).default([]),
  needsSyllabus: z.boolean().default(true),

  completenessScore: z.number().min(0).max(100).default(0),

  lastComputedAt: z.string().nullable().optional(),
});
export type ExamContentCompleteness = z.infer<typeof examContentCompletenessSchema>;

// ─── tRPC input schemas ────────────────────────────────

export const runUniversalDiscoveryInputSchema = z.object({
  /** Portal ids to check. Omit to check all priority-1 daily portals. */
  portalIds: z.array(z.string()).optional(),
  aiProvider: z.enum(["auto", "anthropic", "openai", "google", "mistral"]).default("auto"),
  maxPagesPerPortal: z.number().int().min(1).max(10).default(3),
});
export type RunUniversalDiscoveryInput = z.infer<typeof runUniversalDiscoveryInputSchema>;

export const runDeepDiscoveryInputSchema = z.object({
  examId: z.string().uuid(),
  /** If true, skip portals already crawled for this exam in the last 24h. */
  skipRecent: z.boolean().default(true),
});
export type RunDeepDiscoveryInput = z.infer<typeof runDeepDiscoveryInputSchema>;

export const runExamValidationInputSchema = z.object({
  examId: z.string().uuid(),
});
export type RunExamValidationInput = z.infer<typeof runExamValidationInputSchema>;
