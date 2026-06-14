import { z } from "zod";

export const aiTutorAskSchema = z.object({
  classroomId: z.string().uuid(),
  query: z.string().min(2).max(2000),
  conversationId: z.string().uuid().optional(),
  /** Optional. When set, retrieval is restricted to chunks from this one
   *  content piece. Used by per-content "Ask AI about this" entry points. */
  contentId: z.string().uuid().optional(),
});
export type AiTutorAskInput = z.infer<typeof aiTutorAskSchema>;

export const aiTutorListConversationsSchema = z
  .object({
    classroomId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
  })
  .optional();
export type AiTutorListConversationsInput = z.infer<typeof aiTutorListConversationsSchema>;

export const aiTutorGetConversationSchema = z.object({
  conversationId: z.string().uuid(),
});
export type AiTutorGetConversationInput = z.infer<typeof aiTutorGetConversationSchema>;

export const aiTutorCitationSchema = z.object({
  contentId: z.string().uuid(),
  contentTitle: z.string(),
  chunkIndex: z.number().int().min(0),
  snippet: z.string(),
  similarity: z.number(),
});
export type AiTutorCitationData = z.infer<typeof aiTutorCitationSchema>;
