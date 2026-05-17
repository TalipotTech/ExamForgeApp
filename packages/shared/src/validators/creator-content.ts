import { z } from "zod";

export const creatorContentTypeSchema = z.enum([
  "video",
  "audio",
  "note",
  "document",
  "question_set",
  "image",
  "course",
  "live_session",
  "promotional",
]);
export type CreatorContentType = z.infer<typeof creatorContentTypeSchema>;

export const mediaItemTypeSchema = z.enum(["video", "audio", "image", "document"]);
export type MediaItemType = z.infer<typeof mediaItemTypeSchema>;

export const mediaItemSchema = z.object({
  type: mediaItemTypeSchema,
  url: z.string().max(2000),
  fileUploadId: z.string().uuid().nullable(),
  fileName: z.string().max(500),
  fileSize: z.number().int().min(0),
  mimeType: z.string().max(120),
  order: z.number().int().min(0),
  // `extractedText` is the canonical AI-extracted text slot for the
  // media item, regardless of source pipeline. OCR writes here for
  // images/documents, transcription writes here for audio/video. The
  // embedding pipeline reads from here uniformly via extractTextForContent.
  extractedText: z.string().optional(),
  duration: z.number().int().min(0).optional(),
  // Transcription pipeline lifecycle (audio/video only). OCR uses its
  // own ocrStatus/ocrModel/ocrError fields on the same item — kept
  // separate so a single item could theoretically have both (e.g.
  // future: speech-to-text on a video that also has on-screen text).
  transcriptionStatus: z.enum(["pending", "processing", "completed", "failed"]).optional(),
  transcriptionModel: z.string().max(60).optional(),
  transcriptionError: z.string().max(2000).optional(),
});
export type MediaItem = z.infer<typeof mediaItemSchema>;

export const contentIdInputSchema = z.object({ contentId: z.string().uuid() });
export type ContentIdInput = z.infer<typeof contentIdInputSchema>;

export const updateContentSchema = z.object({
  contentId: z.string().uuid(),
  title: z.string().min(2).max(500).optional(),
  description: z.string().max(5000).optional(),
  body: z.string().max(200000).optional(),
  language: z.string().max(10).optional(),
  isPremium: z.boolean().optional(),
  examId: z.string().uuid().optional().nullable(),
  syllabusNodeId: z.number().int().positive().optional().nullable(),
  subject: z.string().max(255).optional().nullable(),
  topic: z.string().max(255).optional().nullable(),
});
export type UpdateContentInput = z.infer<typeof updateContentSchema>;

export const removeMediaSchema = z.object({
  contentId: z.string().uuid(),
  order: z.number().int().min(0),
});
export type RemoveMediaInput = z.infer<typeof removeMediaSchema>;

export const updateMediaTextSchema = z.object({
  contentId: z.string().uuid(),
  order: z.number().int().min(0),
  extractedText: z.string().max(100000),
});
export type UpdateMediaTextInput = z.infer<typeof updateMediaTextSchema>;

export const ocrModelSchema = z.enum([
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "claude-sonnet-4-6",
  "gpt-4o",
]);
export type OcrModelValue = z.infer<typeof ocrModelSchema>;

export const myContentListSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  contentType: creatorContentTypeSchema.optional(),
});
export type MyContentListInput = z.infer<typeof myContentListSchema>;
