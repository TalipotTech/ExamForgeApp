import { z } from "zod";

export const aiChatProviderEnum = z.enum(["claude", "gemini", "openai", "mistral", "perplexity"]);

export const sendAiChatMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
  provider: aiChatProviderEnum.default("claude"),
  keyword: z.string().max(200).optional(),
  pageContext: z.string().max(100).optional(),
});

export const listAiConversationsSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
  search: z.string().max(200).optional(),
  pageContext: z.string().max(100).optional(),
});

export const getAiConversationSchema = z.object({
  conversationId: z.string().uuid(),
});

export const deleteAiConversationSchema = z.object({
  conversationId: z.string().uuid(),
});

export type SendAiChatMessage = z.infer<typeof sendAiChatMessageSchema>;
export type ListAiConversations = z.infer<typeof listAiConversationsSchema>;
export type GetAiConversation = z.infer<typeof getAiConversationSchema>;
export type DeleteAiConversation = z.infer<typeof deleteAiConversationSchema>;
