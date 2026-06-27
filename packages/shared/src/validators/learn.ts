import { z } from "zod";

// ─── Get Syllabus Learning Tree ───

export const getSyllabusLearningTreeSchema = z.object({
  syllabusId: z.number().int().positive(),
});

export type GetSyllabusLearningTree = z.infer<typeof getSyllabusLearningTreeSchema>;

// ─── Get Tutorial Content ───

export const getTutorialContentSchema = z.object({
  syllabusNodeId: z.number().int().positive(),
});

export type GetTutorialContent = z.infer<typeof getTutorialContentSchema>;

// ─── Mark Section Read ───

export const markSectionReadSchema = z.object({
  tutorialFileId: z.number().int().positive(),
  sectionId: z.string().min(1),
  syllabusId: z.number().int().positive(),
  syllabusNodeId: z.number().int().positive(),
});

export type MarkSectionRead = z.infer<typeof markSectionReadSchema>;

// ─── Search Tutorials ───

export const searchTutorialsSchema = z.object({
  syllabusId: z.number().int().positive(),
  query: z.string().min(2).max(200),
});

export type SearchTutorials = z.infer<typeof searchTutorialsSchema>;

// ─── Mark Topic Complete ───

export const markTopicCompleteSchema = z.object({
  tutorialFileId: z.number().int().positive(),
  syllabusId: z.number().int().positive(),
  syllabusNodeId: z.number().int().positive(),
});

export type MarkTopicComplete = z.infer<typeof markTopicCompleteSchema>;

// ─── Get Navigation Order ───

export const getNavigationOrderSchema = z.object({
  syllabusId: z.number().int().positive(),
});

export type GetNavigationOrder = z.infer<typeof getNavigationOrderSchema>;

// ─── Send Chat Message ───

export const sendChatMessageSchema = z.object({
  syllabusId: z.number().int().positive(),
  syllabusNodeId: z.number().int().positive(),
  tutorialFileId: z.number().int().positive(),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
  keyword: z.string().max(200).optional(),
  provider: z.enum(["claude", "gemini", "openai", "mistral"]).default("claude"),
  // Optional scope preamble — prepended to the tutor's system prompt to keep
  // answers on this topic (used by the in-page scoped tutor on the search
  // results page). Additive + backward-compatible.
  topicScopePreamble: z.string().max(600).optional(),
});

export type SendChatMessage = z.infer<typeof sendChatMessageSchema>;

// ─── Get Conversations for Node ───

export const getConversationsForNodeSchema = z.object({
  syllabusNodeId: z.number().int().positive(),
});

export type GetConversationsForNode = z.infer<typeof getConversationsForNodeSchema>;

// ─── Save Note From Chat ───

export const saveNoteFromChatSchema = z.object({
  conversationId: z.string().uuid(),
  syllabusId: z.number().int().positive(),
  syllabusNodeId: z.number().int().positive(),
  tutorialFileId: z.number().int().positive().optional(),
  keyword: z.string().max(200).optional(),
  noteContent: z.string().min(1).max(10000),
  noteHtml: z.string().max(20000).optional(),
  isPublic: z.boolean().default(false),
});

export type SaveNoteFromChat = z.infer<typeof saveNoteFromChatSchema>;

// ─── Get Notes for Node ───

export const getNotesForNodeSchema = z.object({
  syllabusNodeId: z.number().int().positive(),
});

export type GetNotesForNode = z.infer<typeof getNotesForNodeSchema>;

// ─── User Profile Stats ───

export const getUserProfileStatsSchema = z.object({});

export type GetUserProfileStats = z.infer<typeof getUserProfileStatsSchema>;

// ─── User Keywords ───

export const getUserKeywordsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
});

export type GetUserKeywords = z.infer<typeof getUserKeywordsSchema>;

// ─── User Notes (paginated) ───

export const getUserNotesSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  search: z.string().max(200).optional(),
});

export type GetUserNotes = z.infer<typeof getUserNotesSchema>;

// ─── User Topics with Content ───

export const getUserTopicsWithContentSchema = z.object({
  limit: z.number().int().min(1).max(20).default(10),
  offset: z.number().int().min(0).default(0),
  search: z.string().max(200).optional(),
});

export type GetUserTopicsWithContent = z.infer<typeof getUserTopicsWithContentSchema>;
