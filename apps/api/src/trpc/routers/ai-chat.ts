import { eq, and, desc, ilike, or, count, sum } from "drizzle-orm";
import { aiConversations, aiUsageLogs } from "@examforge/shared/db/schema";
import {
  sendAiChatMessageSchema,
  listAiConversationsSchema,
  getAiConversationSchema,
  deleteAiConversationSchema,
} from "@examforge/shared/validators";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.js";
import { routeTextRequest } from "../../ai/ai-router.js";
import { PROVIDER_ID_TO_AI_PROVIDER } from "../../ai/types.js";

const GENERAL_CHAT_SYSTEM_PROMPT = `You are an expert exam preparation assistant for Indian competitive exams (NEET, GPAT, UPSC, GATE, Kerala PSC, State PSCs, etc.).

You help students:
- Understand complex concepts with clear explanations
- Solve problems step-by-step
- Clarify doubts about subjects and topics
- Create study plans and revision strategies
- Provide mnemonics and memory aids
- Compare and contrast related concepts

Keep answers focused, clear, and educational. Use examples where helpful. Format responses with markdown for readability (headings, lists, bold, code blocks for formulas).

At the end of your response, suggest 2-3 follow-up questions the student could ask to deepen their understanding. Format each suggestion exactly like this, each on its own line:
[[suggest: Your suggested question here]]`;

export const aiChatRouter = router({
  /** Send a message to the general AI chat agent */
  sendMessage: protectedProcedure
    .input(sendAiChatMessageSchema)
    .mutation(async ({ ctx, input }) => {
      const { conversationId, message, provider, keyword } = input;

      type ConvMessage = { role: "user" | "assistant"; content: string; timestamp: string };

      // Load existing conversation if provided
      let existingConv: {
        id: string;
        messages: ConvMessage[];
        messageCount: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
      } | null = null;

      if (conversationId) {
        const [found] = await ctx.db
          .select({
            id: aiConversations.id,
            messages: aiConversations.messages,
            messageCount: aiConversations.messageCount,
            totalInputTokens: aiConversations.totalInputTokens,
            totalOutputTokens: aiConversations.totalOutputTokens,
            totalTokens: aiConversations.totalTokens,
            estimatedCostUsd: aiConversations.estimatedCostUsd,
          })
          .from(aiConversations)
          .where(
            and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, ctx.userId)),
          )
          .limit(1);

        if (found) {
          existingConv = {
            id: found.id,
            messages: (found.messages ?? []) as ConvMessage[],
            messageCount: found.messageCount,
            totalInputTokens: found.totalInputTokens,
            totalOutputTokens: found.totalOutputTokens,
            totalTokens: found.totalTokens,
            estimatedCostUsd: found.estimatedCostUsd,
          };
        }
      }

      const previousMessages: ConvMessage[] = existingConv?.messages ?? [];

      // Build conversation history (last 10 messages)
      const recentHistory = previousMessages.slice(-10);
      const historyText = recentHistory
        .map((m: ConvMessage) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.content}`)
        .join("\n\n");

      const fullPrompt = historyText
        ? `Previous conversation:\n${historyText}\n\nStudent: ${message}`
        : `Student: ${message}`;

      // Map provider ID to AiProvider
      const aiProvider =
        PROVIDER_ID_TO_AI_PROVIDER[provider as keyof typeof PROVIDER_ID_TO_AI_PROVIDER];

      // Call AI
      const aiResult = await routeTextRequest(
        {
          task: "general_chat",
          prompt: fullPrompt,
          systemPrompt: GENERAL_CHAT_SYSTEM_PROMPT,
          userId: ctx.userId,
          overrideProvider: aiProvider,
          temperature: 0.7,
          maxTokens: 2048,
        },
        ctx.db,
      );

      const now = new Date();
      const userMsg: ConvMessage = { role: "user", content: message, timestamp: now.toISOString() };
      const assistantMsg: ConvMessage = {
        role: "assistant",
        content: aiResult.data,
        timestamp: now.toISOString(),
      };
      const updatedMessages = [...previousMessages, userMsg, assistantMsg];

      let savedConversationId: string;

      if (existingConv) {
        await ctx.db
          .update(aiConversations)
          .set({
            messages: updatedMessages,
            messageCount: updatedMessages.length,
            totalInputTokens:
              (existingConv.totalInputTokens ?? 0) + (aiResult.usage.promptTokens ?? 0),
            totalOutputTokens:
              (existingConv.totalOutputTokens ?? 0) + (aiResult.usage.completionTokens ?? 0),
            totalTokens: (existingConv.totalTokens ?? 0) + aiResult.usage.totalTokens,
            estimatedCostUsd:
              (existingConv.estimatedCostUsd ?? 0) + (aiResult.estimatedCostUsd ?? 0),
            aiProvider: provider,
            updatedAt: now,
          })
          .where(eq(aiConversations.id, existingConv.id));
        savedConversationId = existingConv.id;
      } else {
        // Auto-generate title from first message
        const title = message.length > 80 ? message.substring(0, 77) + "..." : message;

        const [inserted] = await ctx.db
          .insert(aiConversations)
          .values({
            userId: ctx.userId,
            title,
            messages: updatedMessages,
            messageCount: updatedMessages.length,
            aiProvider: provider,
            totalInputTokens: aiResult.usage.promptTokens ?? 0,
            totalOutputTokens: aiResult.usage.completionTokens ?? 0,
            totalTokens: aiResult.usage.totalTokens,
            estimatedCostUsd: aiResult.estimatedCostUsd ?? 0,
            keyword: keyword ?? null,
          })
          .returning({ id: aiConversations.id });
        savedConversationId = inserted!.id;
      }

      return {
        conversationId: savedConversationId,
        response: aiResult.data,
        provider: aiResult.provider,
        tokensUsed: aiResult.usage.totalTokens,
      };
    }),

  /** List user's conversations (without full message bodies) */
  listConversations: protectedProcedure
    .input(listAiConversationsSchema.optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;
      const search = input?.search;

      const conditions = [eq(aiConversations.userId, ctx.userId)];
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(ilike(aiConversations.title, pattern), ilike(aiConversations.keyword, pattern))!,
        );
      }

      const whereClause = and(...conditions);

      const [rows, totalResult] = await Promise.all([
        ctx.db
          .select({
            id: aiConversations.id,
            title: aiConversations.title,
            messageCount: aiConversations.messageCount,
            aiProvider: aiConversations.aiProvider,
            totalTokens: aiConversations.totalTokens,
            estimatedCostUsd: aiConversations.estimatedCostUsd,
            keyword: aiConversations.keyword,
            createdAt: aiConversations.createdAt,
            updatedAt: aiConversations.updatedAt,
          })
          .from(aiConversations)
          .where(whereClause)
          .orderBy(desc(aiConversations.updatedAt))
          .limit(limit)
          .offset(offset),

        ctx.db.select({ count: count() }).from(aiConversations).where(whereClause),
      ]);

      return {
        conversations: rows,
        total: Number(totalResult[0]?.count ?? 0),
      };
    }),

  /** Get a single conversation with full messages */
  getConversation: protectedProcedure
    .input(getAiConversationSchema)
    .query(async ({ ctx, input }) => {
      const [conv] = await ctx.db
        .select()
        .from(aiConversations)
        .where(
          and(eq(aiConversations.id, input.conversationId), eq(aiConversations.userId, ctx.userId)),
        )
        .limit(1);

      if (!conv) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      return conv;
    }),

  /** Delete a conversation */
  deleteConversation: protectedProcedure
    .input(deleteAiConversationSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(aiConversations)
        .where(
          and(eq(aiConversations.id, input.conversationId), eq(aiConversations.userId, ctx.userId)),
        );

      return { deleted: true };
    }),

  /** Get usage statistics for the current user */
  getUsageStats: protectedProcedure.query(async ({ ctx }) => {
    // Aggregate from ai_conversations
    const [convStats] = await ctx.db
      .select({
        totalConversations: count(),
        totalInputTokens: sum(aiConversations.totalInputTokens),
        totalOutputTokens: sum(aiConversations.totalOutputTokens),
        totalTokens: sum(aiConversations.totalTokens),
        totalCost: sum(aiConversations.estimatedCostUsd),
      })
      .from(aiConversations)
      .where(eq(aiConversations.userId, ctx.userId));

    // Per-provider breakdown from ai_usage_logs (feature='chat')
    const providerBreakdown = await ctx.db
      .select({
        provider: aiUsageLogs.provider,
        totalCalls: count(),
        inputTokens: sum(aiUsageLogs.inputTokens),
        outputTokens: sum(aiUsageLogs.outputTokens),
        totalCost: sum(aiUsageLogs.estimatedCostUsd),
      })
      .from(aiUsageLogs)
      .where(and(eq(aiUsageLogs.userId, ctx.userId), eq(aiUsageLogs.feature, "chat")))
      .groupBy(aiUsageLogs.provider);

    return {
      totalConversations: Number(convStats?.totalConversations ?? 0),
      totalInputTokens: Number(convStats?.totalInputTokens ?? 0),
      totalOutputTokens: Number(convStats?.totalOutputTokens ?? 0),
      totalTokens: Number(convStats?.totalTokens ?? 0),
      totalCost: Number(convStats?.totalCost ?? 0),
      providerBreakdown: providerBreakdown.map((p) => ({
        provider: p.provider,
        totalCalls: Number(p.totalCalls),
        inputTokens: Number(p.inputTokens ?? 0),
        outputTokens: Number(p.outputTokens ?? 0),
        totalCost: Number(p.totalCost ?? 0),
      })),
    };
  }),
});
