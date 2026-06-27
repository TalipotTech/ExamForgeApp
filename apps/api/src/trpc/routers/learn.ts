import { eq, and, sql, ilike, desc, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, subscriberProcedure } from "../trpc.js";
import {
  getSyllabusLearningTreeSchema,
  getTutorialContentSchema,
  markSectionReadSchema,
  markTopicCompleteSchema,
  searchTutorialsSchema,
  getNavigationOrderSchema,
  sendChatMessageSchema,
  getConversationsForNodeSchema,
  saveNoteFromChatSchema,
  getNotesForNodeSchema,
  getUserProfileStatsSchema,
  getUserKeywordsSchema,
  getUserNotesSchema,
  getUserTopicsWithContentSchema,
} from "@examforge/shared/validators";
import {
  syllabi,
  syllabusNodes,
  tutorialFiles,
  tutorialProgress,
  exams,
  topicConversations,
  topicNotes,
  userGeneratedExams,
  userExams,
  users,
  imageGenerations,
} from "@examforge/shared/db/schema";
import { routeTextRequest } from "../../ai/ai-router.js";
import { PROVIDER_ID_TO_AI_PROVIDER } from "../../ai/types.js";

export const learnRouter = router({
  // ─── List Syllabi With Tutorials ───
  // Returns syllabi that have at least one current tutorial
  listSyllabiWithTutorials: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .selectDistinctOn([syllabi.id], {
        syllabusId: syllabi.id,
        syllabusName: syllabi.name,
        examId: exams.id,
        examName: exams.name,
      })
      .from(tutorialFiles)
      .innerJoin(syllabi, eq(syllabi.id, tutorialFiles.syllabusId))
      .innerJoin(exams, eq(exams.id, tutorialFiles.examId))
      .where(eq(tutorialFiles.isCurrent, true))
      .orderBy(syllabi.id);

    return rows;
  }),

  // ─── Get Syllabus Learning Tree ───
  // Returns syllabus info + nodes tree + tutorial availability + user progress per node + stats
  getSyllabusLearningTree: protectedProcedure
    .input(getSyllabusLearningTreeSchema)
    .query(async ({ ctx, input }) => {
      const { syllabusId } = input;

      // Get syllabus info
      const [syllabus] = await ctx.db
        .select({
          id: syllabi.id,
          examId: syllabi.examId,
          title: syllabi.name,
          status: syllabi.status,
        })
        .from(syllabi)
        .where(eq(syllabi.id, syllabusId))
        .limit(1);

      if (!syllabus) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Syllabus not found" });
      }

      // Get exam name
      const [exam] = await ctx.db
        .select({ name: exams.name })
        .from(exams)
        .where(eq(exams.id, syllabus.examId))
        .limit(1);

      // Get all nodes
      const nodes = await ctx.db
        .select({
          id: syllabusNodes.id,
          parentId: syllabusNodes.parentId,
          nodeType: syllabusNodes.nodeType,
          title: syllabusNodes.title,
          description: syllabusNodes.description,
          depth: syllabusNodes.depth,
          sortOrder: syllabusNodes.sortOrder,
          tutorialStatus: syllabusNodes.tutorialStatus,
        })
        .from(syllabusNodes)
        .where(eq(syllabusNodes.syllabusId, syllabusId))
        .orderBy(syllabusNodes.depth, syllabusNodes.sortOrder);

      // Get tutorial availability — which nodes have current tutorials
      const tutorials = await ctx.db
        .select({
          id: tutorialFiles.id,
          syllabusNodeId: tutorialFiles.syllabusNodeId,
          estimatedReadMinutes: tutorialFiles.estimatedReadMinutes,
          sectionsCount: tutorialFiles.sectionsCount,
          wordCount: tutorialFiles.wordCount,
        })
        .from(tutorialFiles)
        .where(and(eq(tutorialFiles.syllabusId, syllabusId), eq(tutorialFiles.isCurrent, true)));

      const tutorialMap = new Map(tutorials.map((t) => [t.syllabusNodeId, t]));

      // Get user progress for this syllabus
      const progress = await ctx.db
        .select({
          syllabusNodeId: tutorialProgress.syllabusNodeId,
          completionPercent: tutorialProgress.completionPercent,
          lastReadAt: tutorialProgress.lastReadAt,
        })
        .from(tutorialProgress)
        .where(
          and(eq(tutorialProgress.userId, ctx.userId), eq(tutorialProgress.syllabusId, syllabusId)),
        );

      const progressMap = new Map(progress.map((p) => [p.syllabusNodeId, p]));

      // Build enriched nodes
      const enrichedNodes = nodes.map((node) => {
        const tutorial = tutorialMap.get(node.id);
        const prog = progressMap.get(node.id);
        return {
          ...node,
          hasTutorial: !!tutorial,
          tutorialFileId: tutorial?.id ?? null,
          estimatedReadMinutes: tutorial?.estimatedReadMinutes ?? null,
          sectionsCount: tutorial?.sectionsCount ?? null,
          wordCount: tutorial?.wordCount ?? null,
          completionPercent: prog?.completionPercent ?? 0,
          lastReadAt: prog?.lastReadAt ?? null,
        };
      });

      // Calculate overall stats
      const totalTopics = tutorials.length;
      const completedTopics = progress.filter((p) => p.completionPercent >= 100).length;

      return {
        syllabus: {
          id: syllabus.id,
          examId: syllabus.examId,
          title: syllabus.title,
          examName: exam?.name ?? "",
        },
        nodes: enrichedNodes,
        stats: {
          totalTopics,
          completedTopics,
          overallPercent: totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0,
        },
      };
    }),

  // ─── Get Tutorial Content ───
  // Returns sections array from DB, metadata, and user progress
  getTutorialContent: protectedProcedure
    .input(getTutorialContentSchema)
    .query(async ({ ctx, input }) => {
      const { syllabusNodeId } = input;

      const [tutorial] = await ctx.db
        .select({
          id: tutorialFiles.id,
          syllabusNodeId: tutorialFiles.syllabusNodeId,
          syllabusId: tutorialFiles.syllabusId,
          title: tutorialFiles.title,
          sections: tutorialFiles.sections,
          wordCount: tutorialFiles.wordCount,
          estimatedReadMinutes: tutorialFiles.estimatedReadMinutes,
          sectionsCount: tutorialFiles.sectionsCount,
          hasDiagrams: tutorialFiles.hasDiagrams,
          hasFormulas: tutorialFiles.hasFormulas,
          hasTables: tutorialFiles.hasTables,
          hasMnemonics: tutorialFiles.hasMnemonics,
          keyTerms: tutorialFiles.keyTerms,
        })
        .from(tutorialFiles)
        .where(
          and(eq(tutorialFiles.syllabusNodeId, syllabusNodeId), eq(tutorialFiles.isCurrent, true)),
        )
        .limit(1);

      if (!tutorial) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tutorial not found for this topic",
        });
      }

      // AI-generated images — surfaced on the reader. Section nodes (e.g.
      // "Organic chemistry") have no reader page of their own, so images
      // generated for them must surface on their leaf sub-topics. Find the
      // nearest node (self, then ancestors) that has any image, then return
      // ALL of that node's images (a topic can have several). image_url is
      // set on every generation, so it's the cheap marker for "has images".
      const [node] = await ctx.db
        .select({ imageUrl: syllabusNodes.imageUrl, parentId: syllabusNodes.parentId })
        .from(syllabusNodes)
        .where(eq(syllabusNodes.id, syllabusNodeId))
        .limit(1);

      let imageNodeId: number | null = node?.imageUrl ? syllabusNodeId : null;
      let parentId = node?.parentId ?? null;
      let hops = 0;
      while (imageNodeId === null && parentId && hops < 12) {
        const [ancestor] = await ctx.db
          .select({
            id: syllabusNodes.id,
            imageUrl: syllabusNodes.imageUrl,
            parentId: syllabusNodes.parentId,
          })
          .from(syllabusNodes)
          .where(eq(syllabusNodes.id, parentId))
          .limit(1);
        if (!ancestor) break;
        if (ancestor.imageUrl) imageNodeId = Number(ancestor.id);
        parentId = ancestor.parentId ?? null;
        hops += 1;
      }

      const images =
        imageNodeId === null
          ? []
          : await ctx.db
              .select({
                id: imageGenerations.id,
                cdnUrl: imageGenerations.cdnUrl,
                prompt: imageGenerations.prompt,
              })
              .from(imageGenerations)
              .where(eq(imageGenerations.syllabusNodeId, imageNodeId))
              .orderBy(asc(imageGenerations.createdAt));

      // Get user progress
      const [progress] = await ctx.db
        .select({
          sectionsRead: tutorialProgress.sectionsRead,
          completionPercent: tutorialProgress.completionPercent,
          totalReadTimeSeconds: tutorialProgress.totalReadTimeSeconds,
        })
        .from(tutorialProgress)
        .where(
          and(
            eq(tutorialProgress.userId, ctx.userId),
            eq(tutorialProgress.tutorialFileId, tutorial.id),
          ),
        )
        .limit(1);

      return {
        ...tutorial,
        imageUrl: images[0]?.cdnUrl ?? null,
        images,
        sections: tutorial.sections ?? [],
        progress: {
          sectionsRead: progress?.sectionsRead ?? [],
          completionPercent: progress?.completionPercent ?? 0,
          totalReadTimeSeconds: progress?.totalReadTimeSeconds ?? 0,
        },
      };
    }),

  // ─── Mark Section Read ───
  // Upsert tutorial_progress, append sectionId, recalculate completionPercent
  markSectionRead: protectedProcedure
    .input(markSectionReadSchema)
    .mutation(async ({ ctx, input }) => {
      const { tutorialFileId, sectionId, syllabusId, syllabusNodeId } = input;

      // Get total sections count
      const [tutorial] = await ctx.db
        .select({ sections: tutorialFiles.sections })
        .from(tutorialFiles)
        .where(eq(tutorialFiles.id, tutorialFileId))
        .limit(1);

      if (!tutorial) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tutorial not found" });
      }

      const totalSections = tutorial.sections?.length ?? 1;

      // Check for existing progress
      const [existing] = await ctx.db
        .select({
          id: tutorialProgress.id,
          sectionsRead: tutorialProgress.sectionsRead,
        })
        .from(tutorialProgress)
        .where(
          and(
            eq(tutorialProgress.userId, ctx.userId),
            eq(tutorialProgress.tutorialFileId, tutorialFileId),
          ),
        )
        .limit(1);

      if (existing) {
        const currentSections = (existing.sectionsRead ?? []) as string[];
        if (currentSections.includes(sectionId)) {
          // Already marked, update lastReadAt
          await ctx.db
            .update(tutorialProgress)
            .set({ lastReadAt: new Date(), updatedAt: new Date() })
            .where(eq(tutorialProgress.id, existing.id));
          return { completionPercent: Math.round((currentSections.length / totalSections) * 100) };
        }

        const updatedSections = [...currentSections, sectionId];
        const completionPercent = Math.round((updatedSections.length / totalSections) * 100);

        await ctx.db
          .update(tutorialProgress)
          .set({
            sectionsRead: updatedSections,
            completionPercent,
            lastReadAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tutorialProgress.id, existing.id));

        return { completionPercent };
      }

      // Insert new progress
      const completionPercent = Math.round((1 / totalSections) * 100);
      await ctx.db.insert(tutorialProgress).values({
        userId: ctx.userId,
        tutorialFileId,
        syllabusId,
        syllabusNodeId,
        sectionsRead: [sectionId],
        completionPercent,
        lastReadAt: new Date(),
      });

      return { completionPercent };
    }),

  // ─── Mark Topic Complete ───
  // Manually mark all sections as read, setting completionPercent to 100
  markTopicComplete: protectedProcedure
    .input(markTopicCompleteSchema)
    .mutation(async ({ ctx, input }) => {
      const { tutorialFileId, syllabusId, syllabusNodeId } = input;

      // Get all section IDs from the tutorial
      const [tutorial] = await ctx.db
        .select({ sections: tutorialFiles.sections })
        .from(tutorialFiles)
        .where(eq(tutorialFiles.id, tutorialFileId))
        .limit(1);

      if (!tutorial) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tutorial not found" });
      }

      const allSectionIds = (tutorial.sections ?? []).map((s: { id: string }) => s.id);

      // Check for existing progress
      const [existing] = await ctx.db
        .select({ id: tutorialProgress.id })
        .from(tutorialProgress)
        .where(
          and(
            eq(tutorialProgress.userId, ctx.userId),
            eq(tutorialProgress.tutorialFileId, tutorialFileId),
          ),
        )
        .limit(1);

      const now = new Date();

      if (existing) {
        await ctx.db
          .update(tutorialProgress)
          .set({
            sectionsRead: allSectionIds,
            completionPercent: 100,
            lastReadAt: now,
            updatedAt: now,
          })
          .where(eq(tutorialProgress.id, existing.id));
      } else {
        await ctx.db.insert(tutorialProgress).values({
          userId: ctx.userId,
          tutorialFileId,
          syllabusId,
          syllabusNodeId,
          sectionsRead: allSectionIds,
          completionPercent: 100,
          lastReadAt: now,
        });
      }

      return { completionPercent: 100 };
    }),

  // ─── Search Tutorials ───
  // ILIKE on plainText, return snippets around matches
  searchTutorials: protectedProcedure.input(searchTutorialsSchema).query(async ({ ctx, input }) => {
    const { syllabusId, query } = input;

    const results = await ctx.db
      .select({
        id: tutorialFiles.id,
        syllabusNodeId: tutorialFiles.syllabusNodeId,
        title: tutorialFiles.title,
        plainText: tutorialFiles.plainText,
      })
      .from(tutorialFiles)
      .where(
        and(
          eq(tutorialFiles.syllabusId, syllabusId),
          eq(tutorialFiles.isCurrent, true),
          ilike(tutorialFiles.plainText, `%${query}%`),
        ),
      )
      .limit(20);

    // Extract snippets around matches
    return results.map((r) => {
      const text = r.plainText ?? "";
      const lowerText = text.toLowerCase();
      const lowerQuery = query.toLowerCase();
      const idx = lowerText.indexOf(lowerQuery);
      let snippet = "";
      if (idx !== -1) {
        const start = Math.max(0, idx - 80);
        const end = Math.min(text.length, idx + query.length + 80);
        snippet =
          (start > 0 ? "..." : "") +
          text.substring(start, end).trim() +
          (end < text.length ? "..." : "");
      }
      return {
        tutorialFileId: r.id,
        syllabusNodeId: r.syllabusNodeId,
        title: r.title,
        snippet,
      };
    });
  }),

  // ─── Get Navigation Order ───
  // Ordered leaf nodes for prev/next (sorted by depth+sortOrder, NOT alphabetical)
  getNavigationOrder: protectedProcedure
    .input(getNavigationOrderSchema)
    .query(async ({ ctx, input }) => {
      const { syllabusId } = input;

      // Get all nodes ordered by depth + sortOrder
      const allNodes = await ctx.db
        .select({
          id: syllabusNodes.id,
          parentId: syllabusNodes.parentId,
          nodeType: syllabusNodes.nodeType,
          title: syllabusNodes.title,
          depth: syllabusNodes.depth,
          sortOrder: syllabusNodes.sortOrder,
        })
        .from(syllabusNodes)
        .where(eq(syllabusNodes.syllabusId, syllabusId))
        .orderBy(syllabusNodes.depth, syllabusNodes.sortOrder);

      // Find leaf nodes (nodes that have no children)
      const parentIds = new Set(
        allNodes.filter((n) => n.parentId !== null).map((n) => n.parentId!),
      );
      const leafNodes = allNodes.filter((n) => !parentIds.has(n.id) && n.nodeType !== "unit");

      // Get which leaf nodes have tutorials
      const tutorials = await ctx.db
        .select({
          syllabusNodeId: tutorialFiles.syllabusNodeId,
          id: tutorialFiles.id,
        })
        .from(tutorialFiles)
        .where(and(eq(tutorialFiles.syllabusId, syllabusId), eq(tutorialFiles.isCurrent, true)));

      const tutorialNodeIds = new Set(tutorials.map((t) => t.syllabusNodeId));

      // Sort leaf nodes in tree order (DFS)
      // Build children map
      const childrenMap = new Map<number | null, typeof allNodes>();
      for (const node of allNodes) {
        if (!childrenMap.has(node.parentId)) {
          childrenMap.set(node.parentId, []);
        }
        childrenMap.get(node.parentId)!.push(node);
      }

      // DFS traversal to get correct order
      const leafNodeIdSet = new Set(leafNodes.map((n) => n.id));
      const orderedLeaves: Array<{
        id: number;
        title: string;
        hasTutorial: boolean;
      }> = [];

      function dfs(parentId: number | null): void {
        const children = childrenMap.get(parentId) ?? [];
        children.sort((a, b) => a.sortOrder - b.sortOrder);
        for (const child of children) {
          if (leafNodeIdSet.has(child.id)) {
            orderedLeaves.push({
              id: child.id,
              title: child.title,
              hasTutorial: tutorialNodeIds.has(child.id),
            });
          }
          dfs(child.id);
        }
      }
      dfs(null);

      return orderedLeaves;
    }),

  // ─── Send Chat Message ───
  // Creates or appends to a conversation, calls AI with tutorial context
  sendChatMessage: subscriberProcedure
    .input(sendChatMessageSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        syllabusId,
        syllabusNodeId,
        tutorialFileId,
        conversationId,
        message,
        keyword,
        provider,
        topicScopePreamble,
      } = input;

      // Load tutorial plain text for context (first 20KB)
      const [tutorial] = await ctx.db
        .select({ plainText: tutorialFiles.plainText, title: tutorialFiles.title })
        .from(tutorialFiles)
        .where(eq(tutorialFiles.id, tutorialFileId))
        .limit(1);

      if (!tutorial) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tutorial not found" });
      }

      const tutorialContext = (tutorial.plainText ?? "").substring(0, 20000);

      // Load or create conversation
      type ConvMessage = { role: "user" | "assistant"; content: string; timestamp: string };
      let existingConv: {
        id: string;
        messages: ConvMessage[];
        messageCount: number;
        totalTokens: number;
      } | null = null;

      if (conversationId) {
        const [found] = await ctx.db
          .select({
            id: topicConversations.id,
            messages: topicConversations.messages,
            messageCount: topicConversations.messageCount,
            totalTokens: topicConversations.totalTokens,
          })
          .from(topicConversations)
          .where(
            and(
              eq(topicConversations.id, conversationId),
              eq(topicConversations.userId, ctx.userId),
            ),
          )
          .limit(1);

        if (found) {
          existingConv = {
            id: found.id,
            messages: (found.messages ?? []) as ConvMessage[],
            messageCount: found.messageCount,
            totalTokens: found.totalTokens,
          };
        }
      }

      const previousMessages: ConvMessage[] = existingConv?.messages ?? [];

      // Build conversation history for AI context (last 10 messages)
      const recentHistory = previousMessages.slice(-10);
      const historyText = recentHistory
        .map((m: ConvMessage) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
        .join("\n\n");

      const scopePrefix = topicScopePreamble ? `${topicScopePreamble.trim()}\n\n` : "";
      const systemPrompt = `${scopePrefix}You are an expert tutor helping a student learn about "${tutorial.title}".
You have the following tutorial content as context:

---TUTORIAL START---
${tutorialContext}
---TUTORIAL END---

Use this content to provide accurate, helpful answers. If the student asks about something not covered in the tutorial, you may provide general knowledge but clearly indicate it's supplementary information.
Keep answers focused, clear, and educational. Use examples where helpful.

At the end of your response, suggest 2-3 follow-up questions the student could ask to deepen their understanding. Format each suggestion exactly like this, each on its own line:
[[suggest: Your suggested question here]]`;

      const fullPrompt = historyText
        ? `Previous conversation:\n${historyText}\n\nStudent: ${message}`
        : `Student: ${message}`;

      // Map provider ID to AiProvider
      const aiProvider =
        PROVIDER_ID_TO_AI_PROVIDER[provider as keyof typeof PROVIDER_ID_TO_AI_PROVIDER];

      // Call AI
      const aiResult = await routeTextRequest(
        {
          task: "topic_chat",
          prompt: fullPrompt,
          systemPrompt,
          userId: ctx.userId,
          overrideProvider: aiProvider,
          temperature: 0.7,
          maxTokens: 2048,
        },
        ctx.db,
      );

      const now = new Date();
      const userMsg = { role: "user" as const, content: message, timestamp: now.toISOString() };
      const assistantMsg = {
        role: "assistant" as const,
        content: aiResult.data,
        timestamp: now.toISOString(),
      };
      const updatedMessages = [...previousMessages, userMsg, assistantMsg];

      let savedConversationId: string;

      if (existingConv) {
        // Update existing conversation
        await ctx.db
          .update(topicConversations)
          .set({
            messages: updatedMessages,
            messageCount: updatedMessages.length,
            totalTokens: (existingConv.totalTokens ?? 0) + aiResult.usage.totalTokens,
            aiProvider: provider,
            updatedAt: now,
          })
          .where(eq(topicConversations.id, existingConv.id));
        savedConversationId = existingConv.id;
      } else {
        // Create new conversation
        const [inserted] = await ctx.db
          .insert(topicConversations)
          .values({
            userId: ctx.userId,
            contextType: "tutorial",
            contextTitle: tutorial.title,
            messages: updatedMessages,
            messageCount: updatedMessages.length,
            aiProvider: provider,
            totalTokens: aiResult.usage.totalTokens,
            syllabusId,
            syllabusNodeId,
            tutorialFileId,
            keyword: keyword ?? null,
          })
          .returning({ id: topicConversations.id });
        savedConversationId = inserted!.id;
      }

      return {
        conversationId: savedConversationId,
        response: aiResult.data,
        provider: aiResult.provider,
        tokensUsed: aiResult.usage.totalTokens,
      };
    }),

  // ─── Get Latest Conversation (across all topics) ───
  // Used by the in-page scoped tutor to resume the user's last chat when the
  // current topic has none — mirrors Padvik's persistent assistant panel.
  getLatestConversation: protectedProcedure.query(async ({ ctx }) => {
    const [conv] = await ctx.db
      .select({
        id: topicConversations.id,
        contextTitle: topicConversations.contextTitle,
        messages: topicConversations.messages,
        messageCount: topicConversations.messageCount,
        aiProvider: topicConversations.aiProvider,
        syllabusNodeId: topicConversations.syllabusNodeId,
        updatedAt: topicConversations.updatedAt,
      })
      .from(topicConversations)
      .where(eq(topicConversations.userId, ctx.userId))
      .orderBy(desc(topicConversations.updatedAt))
      .limit(1);
    return conv ?? null;
  }),

  // ─── Get Conversations for Node ───
  getConversationsForNode: protectedProcedure
    .input(getConversationsForNodeSchema)
    .query(async ({ ctx, input }) => {
      const conversations = await ctx.db
        .select({
          id: topicConversations.id,
          contextTitle: topicConversations.contextTitle,
          messageCount: topicConversations.messageCount,
          keyword: topicConversations.keyword,
          aiProvider: topicConversations.aiProvider,
          updatedAt: topicConversations.updatedAt,
          messages: topicConversations.messages,
        })
        .from(topicConversations)
        .where(
          and(
            eq(topicConversations.userId, ctx.userId),
            eq(topicConversations.syllabusNodeId, input.syllabusNodeId),
          ),
        )
        .orderBy(desc(topicConversations.updatedAt))
        .limit(20);

      return conversations;
    }),

  // ─── Save Note From Chat ───
  saveNoteFromChat: subscriberProcedure
    .input(saveNoteFromChatSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        conversationId,
        syllabusId,
        syllabusNodeId,
        tutorialFileId,
        keyword,
        noteContent,
        noteHtml,
        isPublic,
      } = input;

      // Verify conversation belongs to user
      const [conv] = await ctx.db
        .select({ id: topicConversations.id })
        .from(topicConversations)
        .where(
          and(eq(topicConversations.id, conversationId), eq(topicConversations.userId, ctx.userId)),
        )
        .limit(1);

      if (!conv) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      // Mark conversation as having saved note
      await ctx.db
        .update(topicConversations)
        .set({ savedAsNote: true, updatedAt: new Date() })
        .where(eq(topicConversations.id, conversationId));

      // Insert note
      const [note] = await ctx.db
        .insert(topicNotes)
        .values({
          userId: ctx.userId,
          conversationId,
          syllabusId,
          syllabusNodeId,
          tutorialFileId: tutorialFileId ?? null,
          keyword: keyword ?? null,
          noteContent,
          noteHtml: noteHtml ?? null,
          isPublic,
        })
        .returning({ id: topicNotes.id });

      return { noteId: note!.id };
    }),

  // ─── Get Notes for Node ───
  getNotesForNode: protectedProcedure.input(getNotesForNodeSchema).query(async ({ ctx, input }) => {
    // Get user's own notes + public notes from others
    const notes = await ctx.db
      .select({
        id: topicNotes.id,
        userId: topicNotes.userId,
        keyword: topicNotes.keyword,
        noteContent: topicNotes.noteContent,
        noteHtml: topicNotes.noteHtml,
        isPublic: topicNotes.isPublic,
        upvotes: topicNotes.upvotes,
        createdAt: topicNotes.createdAt,
      })
      .from(topicNotes)
      .where(
        and(
          eq(topicNotes.syllabusNodeId, input.syllabusNodeId),
          sql`(${topicNotes.userId} = ${ctx.userId} OR ${topicNotes.isPublic} = true)`,
        ),
      )
      .orderBy(desc(topicNotes.createdAt))
      .limit(50);

    return notes.map((n) => ({
      ...n,
      isOwn: n.userId === ctx.userId,
    }));
  }),

  // ─── User Profile Stats ───
  getUserProfileStats: subscriberProcedure
    .input(getUserProfileStatsSchema)
    .query(async ({ ctx }) => {
      const [notesCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(topicNotes)
        .where(eq(topicNotes.userId, ctx.userId));

      const [conversationsCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(topicConversations)
        .where(eq(topicConversations.userId, ctx.userId));

      const [examStats] = await ctx.db
        .select({
          count: sql<number>`count(*)::int`,
          avgScore: sql<number>`coalesce(avg(${userGeneratedExams.bestScore}), 0)::int`,
          totalAttempts: sql<number>`coalesce(sum(${userGeneratedExams.timesAttempted}), 0)::int`,
        })
        .from(userGeneratedExams)
        .where(eq(userGeneratedExams.userId, ctx.userId));

      const [progressStats] = await ctx.db
        .select({
          topicsCompleted: sql<number>`count(case when ${tutorialProgress.completionPercent} >= 100 then 1 end)::int`,
          totalReadTimeSeconds: sql<number>`coalesce(sum(${tutorialProgress.totalReadTimeSeconds}), 0)::int`,
          topicsStarted: sql<number>`count(*)::int`,
        })
        .from(tutorialProgress)
        .where(eq(tutorialProgress.userId, ctx.userId));

      return {
        totalNotes: notesCount?.count ?? 0,
        totalConversations: conversationsCount?.count ?? 0,
        totalExams: examStats?.count ?? 0,
        avgScore: examStats?.avgScore ?? 0,
        totalAttempts: examStats?.totalAttempts ?? 0,
        topicsCompleted: progressStats?.topicsCompleted ?? 0,
        topicsStarted: progressStats?.topicsStarted ?? 0,
        totalReadTimeSeconds: progressStats?.totalReadTimeSeconds ?? 0,
      };
    }),

  // ─── User Keywords ───
  getUserKeywords: subscriberProcedure
    .input(getUserKeywordsSchema)
    .query(async ({ ctx, input }) => {
      const keywords = await ctx.db
        .select({
          keyword: sql<string>`keyword`,
          count: sql<number>`count(*)::int`,
        })
        .from(
          sql`(
            SELECT keyword FROM topic_conversations WHERE user_id = ${ctx.userId} AND keyword IS NOT NULL
            UNION ALL
            SELECT keyword FROM topic_notes WHERE user_id = ${ctx.userId} AND keyword IS NOT NULL
          ) AS combined`,
        )
        .groupBy(sql`keyword`)
        .orderBy(sql`count(*) DESC`)
        .limit(input.limit);

      return keywords;
    }),

  // ─── User Notes (paginated, with topic/syllabus/exam info) ───
  getUserNotes: subscriberProcedure.input(getUserNotesSchema).query(async ({ ctx, input }) => {
    const conditions = [eq(topicNotes.userId, ctx.userId)];

    if (input.search) {
      const searchTerm = `%${input.search}%`;
      conditions.push(
        sql`(${topicNotes.keyword} ILIKE ${searchTerm} OR ${topicNotes.noteContent} ILIKE ${searchTerm})`,
      );
    }

    const notes = await ctx.db
      .select({
        id: topicNotes.id,
        keyword: topicNotes.keyword,
        noteContent: topicNotes.noteContent,
        noteHtml: topicNotes.noteHtml,
        isPublic: topicNotes.isPublic,
        createdAt: topicNotes.createdAt,
        syllabusNodeId: topicNotes.syllabusNodeId,
        syllabusId: topicNotes.syllabusId,
        nodeTitle: syllabusNodes.title,
        syllabusName: syllabi.name,
        examName: exams.name,
      })
      .from(topicNotes)
      .leftJoin(syllabusNodes, eq(syllabusNodes.id, topicNotes.syllabusNodeId))
      .leftJoin(syllabi, eq(syllabi.id, topicNotes.syllabusId))
      .leftJoin(exams, eq(exams.id, syllabi.examId))
      .where(and(...conditions))
      .orderBy(desc(topicNotes.createdAt))
      .limit(input.limit)
      .offset(input.offset);

    return notes;
  }),

  // ─── Dashboard Data ───
  getDashboardData: protectedProcedure.query(async ({ ctx }) => {
    // 1. Selected exams
    const selectedExams = await ctx.db
      .select({
        examId: userExams.examId,
        examName: exams.name,
        examCategory: exams.category,
        targetScore: userExams.targetScore,
        priority: userExams.priority,
      })
      .from(userExams)
      .innerJoin(exams, eq(exams.id, userExams.examId))
      .where(and(eq(userExams.userId, ctx.userId), eq(userExams.isActive, true)))
      .orderBy(userExams.priority);

    // 2. Get syllabi for selected exams (for "Learn" links)
    const examIds = selectedExams.map((e) => e.examId);
    let examSyllabi: Array<{ examId: string; syllabusId: number; syllabusName: string }> = [];
    if (examIds.length > 0) {
      examSyllabi = await ctx.db
        .select({
          examId: syllabi.examId,
          syllabusId: syllabi.id,
          syllabusName: syllabi.name,
        })
        .from(syllabi)
        .where(
          sql`${syllabi.examId} IN (${sql.join(
            examIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );
    }

    // 3. Recent progress (continue learning)
    const recentProgress = await ctx.db
      .select({
        syllabusId: tutorialProgress.syllabusId,
        syllabusNodeId: tutorialProgress.syllabusNodeId,
        completionPercent: tutorialProgress.completionPercent,
        lastReadAt: tutorialProgress.lastReadAt,
        nodeTitle: syllabusNodes.title,
        syllabusName: syllabi.name,
      })
      .from(tutorialProgress)
      .innerJoin(syllabusNodes, eq(syllabusNodes.id, tutorialProgress.syllabusNodeId))
      .innerJoin(syllabi, eq(syllabi.id, tutorialProgress.syllabusId))
      .where(eq(tutorialProgress.userId, ctx.userId))
      .orderBy(desc(tutorialProgress.lastReadAt))
      .limit(5);

    // 4. Recent exam results
    const recentExams = await ctx.db
      .select({
        id: userGeneratedExams.id,
        title: userGeneratedExams.title,
        questionCount: userGeneratedExams.questionCount,
        bestScore: userGeneratedExams.bestScore,
        timesAttempted: userGeneratedExams.timesAttempted,
        createdAt: userGeneratedExams.createdAt,
      })
      .from(userGeneratedExams)
      .where(eq(userGeneratedExams.userId, ctx.userId))
      .orderBy(desc(userGeneratedExams.createdAt))
      .limit(5);

    // 5. Notes count
    const [notesCountResult] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(topicNotes)
      .where(eq(topicNotes.userId, ctx.userId));

    // 6. Recent topics (for My Topics section)
    const recentTopics = await ctx.db
      .select({
        nodeId: syllabusNodes.id,
        nodeTitle: syllabusNodes.title,
        syllabusId: syllabi.id,
        syllabusName: syllabi.name,
        completionPercent: tutorialProgress.completionPercent,
        lastReadAt: tutorialProgress.lastReadAt,
      })
      .from(tutorialProgress)
      .innerJoin(syllabusNodes, eq(syllabusNodes.id, tutorialProgress.syllabusNodeId))
      .innerJoin(syllabi, eq(syllabi.id, tutorialProgress.syllabusId))
      .where(eq(tutorialProgress.userId, ctx.userId))
      .orderBy(desc(tutorialProgress.lastReadAt))
      .limit(6);

    // 7. Topics count
    const [topicsCountResult] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tutorialProgress)
      .where(eq(tutorialProgress.userId, ctx.userId));

    // 8. User activity info
    const [userInfo] = await ctx.db
      .select({
        lastLoginAt: users.lastLoginAt,
        lastLoginIp: users.lastLoginIp,
        loginCount: users.loginCount,
      })
      .from(users)
      .where(eq(users.id, ctx.userId));

    return {
      selectedExams: selectedExams.map((e) => ({
        ...e,
        syllabi: examSyllabi.filter((s) => s.examId === e.examId),
      })),
      recentProgress,
      recentExams,
      totalNotes: notesCountResult?.count ?? 0,
      recentTopics,
      totalTopics: topicsCountResult?.count ?? 0,
      userActivity: userInfo
        ? {
            lastLoginAt: userInfo.lastLoginAt?.toISOString() ?? null,
            lastLoginIp: userInfo.lastLoginIp ?? null,
            loginCount: userInfo.loginCount,
          }
        : null,
    };
  }),

  // ─── Get User Topics with Content ───
  // Returns topics the user has been learning with their tutorial content
  getUserTopicsWithContent: subscriberProcedure
    .input(getUserTopicsWithContentSchema)
    .query(async ({ ctx, input }) => {
      const { limit, offset, search } = input;

      const conditions = [eq(tutorialProgress.userId, ctx.userId)];

      if (search) {
        conditions.push(
          sql`(${ilike(syllabusNodes.title, `%${search}%`)} OR ${ilike(tutorialFiles.plainText, `%${search}%`)})`,
        );
      }

      const topics = await ctx.db
        .select({
          nodeId: syllabusNodes.id,
          nodeTitle: syllabusNodes.title,
          syllabusId: syllabi.id,
          syllabusName: syllabi.name,
          examName: exams.name,
          completionPercent: tutorialProgress.completionPercent,
          lastReadAt: tutorialProgress.lastReadAt,
          tutorialFileId: tutorialFiles.id,
          sections: tutorialFiles.sections,
          plainText: tutorialFiles.plainText,
          wordCount: tutorialFiles.wordCount,
          estimatedReadMinutes: tutorialFiles.estimatedReadMinutes,
          sectionsCount: tutorialFiles.sectionsCount,
        })
        .from(tutorialProgress)
        .innerJoin(
          tutorialFiles,
          and(
            eq(tutorialFiles.syllabusNodeId, tutorialProgress.syllabusNodeId),
            eq(tutorialFiles.isCurrent, true),
          ),
        )
        .innerJoin(syllabusNodes, eq(syllabusNodes.id, tutorialProgress.syllabusNodeId))
        .innerJoin(syllabi, eq(syllabi.id, tutorialProgress.syllabusId))
        .leftJoin(exams, eq(exams.id, syllabi.examId))
        .where(and(...conditions))
        .orderBy(desc(tutorialProgress.lastReadAt))
        .limit(limit)
        .offset(offset);

      return topics;
    }),
});
