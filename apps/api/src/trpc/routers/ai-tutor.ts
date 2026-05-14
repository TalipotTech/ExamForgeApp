import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@examforge/shared/db";
import {
  aiTutorConversations,
  aiTutorMessages,
  classrooms,
  classroomMembers,
  contentEmbeddings,
  creatorContent,
  type AiTutorCitation,
} from "@examforge/shared/db/schema";
import {
  aiTutorAskSchema,
  aiTutorListConversationsSchema,
  aiTutorGetConversationSchema,
} from "@examforge/shared/validators";
import { router, protectedProcedure } from "../trpc.js";
import { routeEmbedRequest, routeTextRequest } from "../../ai/ai-router.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";
import { getRedisClient } from "../../lib/redis.js";

const TOP_K = 8;
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const NOT_FOUND_REPLY =
  "I couldn't find this in your classroom's materials. Try rephrasing, or ask your teacher to add content covering this topic.";

// Local copy of classroom.ts's membership check. Duplicated rather than
// imported to avoid coupling router files; can be hoisted to a shared lib
// once a third router needs it.
async function requireMemberOrTeacher(
  db: Database,
  classroomId: string,
  userId: string,
): Promise<{ classroom: typeof classrooms.$inferSelect; isTeacher: boolean }> {
  const [classroom] = await db
    .select()
    .from(classrooms)
    .where(eq(classrooms.id, classroomId))
    .limit(1);
  if (!classroom) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Classroom not found" });
  }
  if (classroom.teacherId === userId) {
    return { classroom, isTeacher: true };
  }
  const [member] = await db
    .select({ id: classroomMembers.id })
    .from(classroomMembers)
    .where(
      and(
        eq(classroomMembers.classroomId, classroomId),
        eq(classroomMembers.studentId, userId),
        eq(classroomMembers.status, "active"),
      ),
    )
    .limit(1);
  if (!member) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this classroom" });
  }
  return { classroom, isTeacher: false };
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function cacheKey(classroomId: string, query: string): string {
  const hash = createHash("sha256").update(normalizeQuery(query)).digest("hex");
  return `aitutor:answer:${classroomId}:${hash}`;
}

type CachedAnswer = {
  answer: string;
  citations: AiTutorCitation[];
  tokensUsed: number;
};

async function readCache(key: string): Promise<CachedAnswer | null> {
  try {
    const raw = await getRedisClient().get(key);
    return raw ? (JSON.parse(raw) as CachedAnswer) : null;
  } catch (err) {
    console.warn("[ai-tutor] cache read failed:", err);
    return null;
  }
}

async function writeCache(key: string, value: CachedAnswer): Promise<void> {
  try {
    await getRedisClient().set(key, JSON.stringify(value), "EX", CACHE_TTL_SECONDS);
  } catch (err) {
    console.warn("[ai-tutor] cache write failed:", err);
  }
}

function buildSystemPrompt(): string {
  return `You are an AI tutor helping a student with material assigned to their classroom.

You will be given a question and excerpts from the classroom's content. Answer the question using ONLY the provided excerpts.

Rules:
- If the excerpts cover the question: answer clearly and concisely. Use markdown for formatting (headings, lists, bold). When you state a fact, cite the excerpt with a numbered chip like [1] or [2] matching the excerpt number.
- If the excerpts do NOT cover the question, reply EXACTLY with: "${NOT_FOUND_REPLY}" — do not improvise an answer.
- Do not invent facts. Do not pull from your general knowledge unless the excerpts support it.
- Keep responses focused and exam-prep-ready.`;
}

function buildUserPrompt(
  query: string,
  chunks: { sourceText: string; contentTitle: string }[],
): string {
  const excerpts = chunks
    .map(
      (c, idx) =>
        `[${idx + 1}] From "${c.contentTitle}":\n${c.sourceText.trim()}`,
    )
    .join("\n\n---\n\n");
  return `Question: ${query}\n\nClassroom excerpts:\n\n${excerpts}`;
}

export const aiTutorRouter = router({
  ask: protectedProcedure
    .input(aiTutorAskSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.ai_tutor_enabled");
      const { classroom } = await requireMemberOrTeacher(
        ctx.db,
        input.classroomId,
        ctx.userId,
      );

      // ─── Conversation upsert ───
      let conversationId = input.conversationId;
      if (conversationId) {
        const [existing] = await ctx.db
          .select({ id: aiTutorConversations.id })
          .from(aiTutorConversations)
          .where(
            and(
              eq(aiTutorConversations.id, conversationId),
              eq(aiTutorConversations.userId, ctx.userId),
              eq(aiTutorConversations.classroomId, classroom.id),
            ),
          )
          .limit(1);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
        }
      } else {
        const title =
          input.query.length > 80 ? `${input.query.slice(0, 77)}...` : input.query;
        const [inserted] = await ctx.db
          .insert(aiTutorConversations)
          .values({
            userId: ctx.userId,
            classroomId: classroom.id,
            title,
          })
          .returning({ id: aiTutorConversations.id });
        conversationId = inserted!.id;
      }

      const now = new Date();

      // Persist the user message immediately so it shows in history even if
      // generation later fails.
      await ctx.db.insert(aiTutorMessages).values({
        conversationId,
        role: "user",
        content: input.query,
        citations: [],
        tokensUsed: 0,
        cached: false,
      });

      // ─── Redis cache hit fast-path ───
      const key = cacheKey(classroom.id, input.query);
      const cached = await readCache(key);
      if (cached) {
        await ctx.db.insert(aiTutorMessages).values({
          conversationId,
          role: "assistant",
          content: cached.answer,
          citations: cached.citations,
          tokensUsed: cached.tokensUsed,
          cached: true,
        });
        await ctx.db
          .update(aiTutorConversations)
          .set({
            messageCount: sql`${aiTutorConversations.messageCount} + 2`,
            updatedAt: now,
          })
          .where(eq(aiTutorConversations.id, conversationId));
        return {
          conversationId,
          answer: cached.answer,
          citations: cached.citations,
          tokensUsed: cached.tokensUsed,
          cached: true,
        };
      }

      // ─── Candidate set: all content assigned to this classroom ───
      const candidateContent = await ctx.db
        .select({ id: creatorContent.id, title: creatorContent.title })
        .from(creatorContent)
        .where(
          and(
            sql`${creatorContent.assignedClassrooms} @> ${JSON.stringify([classroom.id])}::jsonb`,
            eq(creatorContent.isPublished, true),
          ),
        );

      if (candidateContent.length === 0) {
        await ctx.db.insert(aiTutorMessages).values({
          conversationId,
          role: "assistant",
          content: NOT_FOUND_REPLY,
          citations: [],
          tokensUsed: 0,
          cached: false,
        });
        await ctx.db
          .update(aiTutorConversations)
          .set({
            messageCount: sql`${aiTutorConversations.messageCount} + 2`,
            updatedAt: now,
          })
          .where(eq(aiTutorConversations.id, conversationId));
        return {
          conversationId,
          answer: NOT_FOUND_REPLY,
          citations: [] as AiTutorCitation[],
          tokensUsed: 0,
          cached: false,
        };
      }

      const candidateIds = candidateContent.map((c) => c.id);
      const titleById = new Map(candidateContent.map((c) => [c.id, c.title]));

      // ─── Embed query, retrieve top-K chunks ───
      const embedResult = await routeEmbedRequest(
        {
          task: "embed_text",
          texts: [input.query],
          userId: ctx.userId,
          feature: "rag-embed",
        },
        ctx.db,
      );
      const queryVector = embedResult.embeddings[0];
      if (!queryVector) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to embed query",
        });
      }

      const queryLiteral = `[${queryVector.join(",")}]`;
      const topChunks = await ctx.db
        .select({
          id: contentEmbeddings.id,
          contentId: contentEmbeddings.contentId,
          chunkIndex: contentEmbeddings.chunkIndex,
          sourceText: contentEmbeddings.sourceText,
          distance: sql<number>`${contentEmbeddings.embedding} <=> ${queryLiteral}::vector`,
        })
        .from(contentEmbeddings)
        .where(inArray(contentEmbeddings.contentId, candidateIds))
        .orderBy(sql`${contentEmbeddings.embedding} <=> ${queryLiteral}::vector`)
        .limit(TOP_K);

      if (topChunks.length === 0) {
        await ctx.db.insert(aiTutorMessages).values({
          conversationId,
          role: "assistant",
          content: NOT_FOUND_REPLY,
          citations: [],
          tokensUsed: 0,
          cached: false,
        });
        await ctx.db
          .update(aiTutorConversations)
          .set({
            messageCount: sql`${aiTutorConversations.messageCount} + 2`,
            updatedAt: now,
          })
          .where(eq(aiTutorConversations.id, conversationId));
        return {
          conversationId,
          answer: NOT_FOUND_REPLY,
          citations: [] as AiTutorCitation[],
          tokensUsed: 0,
          cached: false,
        };
      }

      const chunksWithTitles = topChunks.map((c) => ({
        sourceText: c.sourceText,
        contentTitle: titleById.get(c.contentId) ?? "Untitled",
        contentId: c.contentId,
        chunkIndex: c.chunkIndex,
        similarity: 1 - c.distance,
      }));

      const citations: AiTutorCitation[] = chunksWithTitles.map((c) => ({
        contentId: c.contentId,
        contentTitle: c.contentTitle,
        chunkIndex: c.chunkIndex,
        snippet: c.sourceText.slice(0, 240),
        similarity: c.similarity,
      }));

      // ─── Generate answer ───
      const ai = await routeTextRequest(
        {
          task: "general_chat",
          prompt: buildUserPrompt(input.query, chunksWithTitles),
          systemPrompt: buildSystemPrompt(),
          userId: ctx.userId,
          temperature: 0.3,
          maxTokens: 1500,
          feature: "rag-answer",
        },
        ctx.db,
      );

      const answer = ai.data;
      const tokensUsed = ai.usage.totalTokens;
      const isNotFoundReply = answer.trim() === NOT_FOUND_REPLY;
      const finalCitations = isNotFoundReply ? [] : citations;

      await ctx.db.insert(aiTutorMessages).values({
        conversationId,
        role: "assistant",
        content: answer,
        citations: finalCitations,
        tokensUsed,
        cached: false,
      });
      await ctx.db
        .update(aiTutorConversations)
        .set({
          messageCount: sql`${aiTutorConversations.messageCount} + 2`,
          totalInputTokens: sql`${aiTutorConversations.totalInputTokens} + ${ai.usage.promptTokens ?? 0}`,
          totalOutputTokens: sql`${aiTutorConversations.totalOutputTokens} + ${ai.usage.completionTokens ?? 0}`,
          totalTokens: sql`${aiTutorConversations.totalTokens} + ${tokensUsed}`,
          estimatedCostUsd: sql`${aiTutorConversations.estimatedCostUsd} + ${ai.estimatedCostUsd}`,
          updatedAt: now,
        })
        .where(eq(aiTutorConversations.id, conversationId));

      // Cache real answers only — not the "couldn't find" fallback, so adding
      // content later doesn't keep returning the stale negative response.
      if (!isNotFoundReply) {
        await writeCache(key, { answer, citations: finalCitations, tokensUsed });
      }

      return {
        conversationId,
        answer,
        citations: finalCitations,
        tokensUsed,
        cached: false,
      };
    }),

  listConversations: protectedProcedure
    .input(aiTutorListConversationsSchema)
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.ai_tutor_enabled");
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;
      const conditions = [eq(aiTutorConversations.userId, ctx.userId)];
      if (input?.classroomId) {
        conditions.push(eq(aiTutorConversations.classroomId, input.classroomId));
      }
      const rows = await ctx.db
        .select({
          id: aiTutorConversations.id,
          classroomId: aiTutorConversations.classroomId,
          title: aiTutorConversations.title,
          messageCount: aiTutorConversations.messageCount,
          totalTokens: aiTutorConversations.totalTokens,
          estimatedCostUsd: aiTutorConversations.estimatedCostUsd,
          createdAt: aiTutorConversations.createdAt,
          updatedAt: aiTutorConversations.updatedAt,
        })
        .from(aiTutorConversations)
        .where(and(...conditions))
        .orderBy(desc(aiTutorConversations.updatedAt))
        .limit(limit)
        .offset(offset);
      return { conversations: rows };
    }),

  getConversation: protectedProcedure
    .input(aiTutorGetConversationSchema)
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.ai_tutor_enabled");
      const [conv] = await ctx.db
        .select()
        .from(aiTutorConversations)
        .where(
          and(
            eq(aiTutorConversations.id, input.conversationId),
            eq(aiTutorConversations.userId, ctx.userId),
          ),
        )
        .limit(1);
      if (!conv) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }
      const messages = await ctx.db
        .select()
        .from(aiTutorMessages)
        .where(eq(aiTutorMessages.conversationId, conv.id))
        .orderBy(aiTutorMessages.createdAt);
      return { conversation: conv, messages };
    }),
});
