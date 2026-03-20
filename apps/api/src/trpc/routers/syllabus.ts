import { z } from "zod";
import { eq, and, inArray, sql, ilike, gte } from "drizzle-orm";
import {
  syllabi,
  syllabusNodes,
  tutorials,
  tutorialQuestions,
  questions,
  examSessions,
  exams,
} from "@examforge/shared/db/schema";
import type { TutorialContent } from "@examforge/shared/db/schema";
import {
  createSyllabusSchema,
  generateTutorialInputSchema,
  generateMCQsInputSchema,
  createExamFromNodesSchema,
  tutorialContentSchema,
} from "@examforge/shared/validators";
import { generatedQuestionsResponseSchema } from "@examforge/shared/validators";
import { router, protectedProcedure } from "../trpc.js";
import { addSyllabusJob } from "../../queues/syllabus-queue.js";
import { multiAgentRequest } from "../../ai/multi-agent.js";
import { buildTutorialGenerationPrompt } from "../../ai/prompts/tutorial-generation.js";
import { buildMCQFromTutorialPrompt } from "../../ai/prompts/tutorial-to-mcq.js";
import type { AIProviderId } from "../../ai/types.js";

// ─── Syllabus Router ───

export const syllabusRouter = router({
  // ─── Upload: Get presigned URL ───
  getUploadUrl: protectedProcedure
    .input(createSyllabusSchema)
    .mutation(
      async ({
        ctx,
        input,
      }): Promise<{ syllabusId: number; uploadUrl: string; fileKey: string }> => {
        const fileKey = `syllabi/${ctx.orgId ?? "default"}/${Date.now()}-${input.filename}`;

        // Create syllabus record
        const [record] = await ctx.db
          .insert(syllabi)
          .values({
            examId: input.examId,
            orgId: ctx.orgId,
            name: input.filename.replace(/\.pdf$/i, ""),
            fileKey,
            mimeType: input.mimeType,
            status: "uploading",
            createdBy: ctx.userId,
          })
          .returning({ id: syllabi.id });

        // TODO: Generate S3 presigned URL
        // const s3 = new S3Client({ region: "ap-south-1" });
        // const command = new PutObjectCommand({ Bucket, Key: fileKey, ContentType: input.mimeType });
        // const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        const uploadUrl = `https://s3.ap-south-1.amazonaws.com/placeholder/${fileKey}`;

        return {
          syllabusId: record!.id,
          uploadUrl,
          fileKey,
        };
      },
    ),

  // ─── Process uploaded syllabus ───
  processUpload: protectedProcedure
    .input(z.object({ syllabusId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }): Promise<{ jobId: string }> => {
      // Fetch syllabus record
      const [record] = await ctx.db
        .select()
        .from(syllabi)
        .where(eq(syllabi.id, input.syllabusId))
        .limit(1);

      if (!record) {
        throw new Error(`Syllabus ${input.syllabusId} not found`);
      }

      // Queue processing job
      const jobId = await addSyllabusJob({
        syllabusId: record.id,
        examId: record.examId,
        fileKey: record.fileKey,
        userId: ctx.userId,
      });

      return { jobId };
    }),

  // ─── Get processing status ───
  getStatus: protectedProcedure.input(z.object({ syllabusId: z.number().int().positive() })).query(
    async ({
      ctx,
      input,
    }): Promise<{
      status: string;
      errorMessage: string | null;
      pageCount: number | null;
    }> => {
      const [record] = await ctx.db
        .select({
          status: syllabi.status,
          errorMessage: syllabi.errorMessage,
          pageCount: syllabi.pageCount,
        })
        .from(syllabi)
        .where(eq(syllabi.id, input.syllabusId))
        .limit(1);

      if (!record) {
        throw new Error(`Syllabus ${input.syllabusId} not found`);
      }

      return record;
    },
  ),

  // ─── List syllabi for exam ───
  list: protectedProcedure.input(z.object({ examId: z.string().uuid() })).query(
    async ({
      ctx,
      input,
    }): Promise<
      Array<{
        id: number;
        name: string;
        status: string | null;
        pageCount: number | null;
        createdAt: Date;
      }>
    > => {
      const rows = await ctx.db
        .select({
          id: syllabi.id,
          name: syllabi.name,
          status: syllabi.status,
          pageCount: syllabi.pageCount,
          createdAt: syllabi.createdAt,
        })
        .from(syllabi)
        .where(eq(syllabi.examId, input.examId))
        .orderBy(syllabi.createdAt);

      return rows;
    },
  ),

  // ─── Get full tree for a syllabus ───
  getTree: protectedProcedure.input(z.object({ syllabusId: z.number().int().positive() })).query(
    async ({
      ctx,
      input,
    }): Promise<{
      syllabus: {
        id: number;
        name: string;
        status: string | null;
        pageCount: number | null;
      };
      nodes: Array<{
        id: number;
        parentId: number | null;
        nodeType: string;
        title: string;
        description: string | null;
        depth: number;
        sortOrder: number;
        keyTerms: string[] | null;
        tutorialStatus: string | null;
        mcqStatus: string | null;
        mcqCount: number | null;
      }>;
    }> => {
      const [syllabus] = await ctx.db
        .select({
          id: syllabi.id,
          name: syllabi.name,
          status: syllabi.status,
          pageCount: syllabi.pageCount,
        })
        .from(syllabi)
        .where(eq(syllabi.id, input.syllabusId))
        .limit(1);

      if (!syllabus) {
        throw new Error(`Syllabus ${input.syllabusId} not found`);
      }

      const nodes = await ctx.db
        .select({
          id: syllabusNodes.id,
          parentId: syllabusNodes.parentId,
          nodeType: syllabusNodes.nodeType,
          title: syllabusNodes.title,
          description: syllabusNodes.description,
          depth: syllabusNodes.depth,
          sortOrder: syllabusNodes.sortOrder,
          keyTerms: syllabusNodes.keyTerms,
          tutorialStatus: syllabusNodes.tutorialStatus,
          mcqStatus: syllabusNodes.mcqStatus,
          mcqCount: syllabusNodes.mcqCount,
        })
        .from(syllabusNodes)
        .where(eq(syllabusNodes.syllabusId, input.syllabusId))
        .orderBy(syllabusNodes.depth, syllabusNodes.sortOrder);

      return { syllabus, nodes };
    },
  ),

  // ─── Get single node with children ───
  getNode: protectedProcedure.input(z.object({ nodeId: z.number().int().positive() })).query(
    async ({
      ctx,
      input,
    }): Promise<{
      node: {
        id: number;
        syllabusId: number;
        parentId: number | null;
        nodeType: string;
        title: string;
        description: string | null;
        content: string | null;
        depth: number;
        keyTerms: string[] | null;
        tutorialStatus: string | null;
        mcqStatus: string | null;
        mcqCount: number | null;
      };
      children: Array<{
        id: number;
        nodeType: string;
        title: string;
        depth: number;
        sortOrder: number;
        tutorialStatus: string | null;
        mcqStatus: string | null;
      }>;
    }> => {
      const [node] = await ctx.db
        .select({
          id: syllabusNodes.id,
          syllabusId: syllabusNodes.syllabusId,
          parentId: syllabusNodes.parentId,
          nodeType: syllabusNodes.nodeType,
          title: syllabusNodes.title,
          description: syllabusNodes.description,
          content: syllabusNodes.content,
          depth: syllabusNodes.depth,
          keyTerms: syllabusNodes.keyTerms,
          tutorialStatus: syllabusNodes.tutorialStatus,
          mcqStatus: syllabusNodes.mcqStatus,
          mcqCount: syllabusNodes.mcqCount,
        })
        .from(syllabusNodes)
        .where(eq(syllabusNodes.id, input.nodeId))
        .limit(1);

      if (!node) {
        throw new Error(`Node ${input.nodeId} not found`);
      }

      const children = await ctx.db
        .select({
          id: syllabusNodes.id,
          nodeType: syllabusNodes.nodeType,
          title: syllabusNodes.title,
          depth: syllabusNodes.depth,
          sortOrder: syllabusNodes.sortOrder,
          tutorialStatus: syllabusNodes.tutorialStatus,
          mcqStatus: syllabusNodes.mcqStatus,
        })
        .from(syllabusNodes)
        .where(eq(syllabusNodes.parentId, input.nodeId))
        .orderBy(syllabusNodes.sortOrder);

      return { node, children };
    },
  ),

  // ─── Generate Tutorial ───
  generateTutorial: protectedProcedure.input(generateTutorialInputSchema).mutation(
    async ({
      ctx,
      input,
    }): Promise<{
      tutorialId: number;
      providersUsed: string[];
    }> => {
      // 1. Fetch node and parent context
      const [node] = await ctx.db
        .select()
        .from(syllabusNodes)
        .where(eq(syllabusNodes.id, input.nodeId))
        .limit(1);

      if (!node) {
        throw new Error(`Node ${input.nodeId} not found`);
      }

      // Get parent for context
      let parentTitle = "";
      if (node.parentId) {
        const [parent] = await ctx.db
          .select({ title: syllabusNodes.title })
          .from(syllabusNodes)
          .where(eq(syllabusNodes.id, node.parentId))
          .limit(1);
        parentTitle = parent?.title ?? "";
      }

      // Get exam name
      const [syllabus] = await ctx.db
        .select({ examId: syllabi.examId })
        .from(syllabi)
        .where(eq(syllabi.id, node.syllabusId))
        .limit(1);

      const [exam] = await ctx.db
        .select({ name: exams.name })
        .from(exams)
        .where(eq(exams.id, syllabus!.examId))
        .limit(1);

      // 2. Update node status
      await ctx.db
        .update(syllabusNodes)
        .set({ tutorialStatus: "generating", updatedAt: new Date() })
        .where(eq(syllabusNodes.id, input.nodeId));

      try {
        // 3. Build prompt
        const { systemPrompt, prompt } = buildTutorialGenerationPrompt({
          examName: exam!.name,
          nodeTitle: node.title,
          parentContext: parentTitle ? `${parentTitle} > ${node.title}` : node.title,
          description: node.description ?? undefined,
          keyTerms: (node.keyTerms as string[]) ?? [],
          difficultyLevel: "intermediate",
        });

        // 4. Call multi-agent
        const result = await multiAgentRequest(
          {
            task: "generate_tutorial",
            providers: input.providers as AIProviderId[],
            prompt,
            systemPrompt,
            schema: tutorialContentSchema,
            mergeStrategy: "combine",
            userId: ctx.userId,
            examId: syllabus!.examId,
          },
          ctx.db,
        );

        const tutorialContent = result.merged as TutorialContent;

        // 5. Build plain text from sections
        const contentText = tutorialContent.sections
          .map((s) => `${s.title}\n${s.body}`)
          .join("\n\n");

        // 6. Determine version
        const [existing] = await ctx.db
          .select({ maxVersion: sql<number>`COALESCE(MAX(${tutorials.version}), 0)` })
          .from(tutorials)
          .where(eq(tutorials.syllabusNodeId, input.nodeId));

        const nextVersion = (existing?.maxVersion ?? 0) + 1;

        // Mark old versions as not current
        if (nextVersion > 1) {
          await ctx.db
            .update(tutorials)
            .set({ isCurrent: false, updatedAt: new Date() })
            .where(and(eq(tutorials.syllabusNodeId, input.nodeId), eq(tutorials.isCurrent, true)));
        }

        // 7. Insert tutorial
        const [tutorial] = await ctx.db
          .insert(tutorials)
          .values({
            syllabusNodeId: input.nodeId,
            examId: syllabus!.examId,
            orgId: ctx.orgId,
            version: nextVersion,
            title: node.title,
            content: tutorialContent,
            contentText,
            providersUsed: result.mergeMetadata.providersUsed,
            generationConfig: {
              mode: input.mode,
              totalCostUsd: result.mergeMetadata.totalCostUsd,
              totalLatencyMs: result.mergeMetadata.totalLatencyMs,
            },
            wordCount: contentText.split(/\s+/).length,
            estimatedReadMinutes: Math.ceil(contentText.split(/\s+/).length / 200),
            isCurrent: true,
            createdBy: ctx.userId,
          })
          .returning({ id: tutorials.id });

        // 8. Update node status
        await ctx.db
          .update(syllabusNodes)
          .set({ tutorialStatus: "generated", updatedAt: new Date() })
          .where(eq(syllabusNodes.id, input.nodeId));

        return {
          tutorialId: tutorial!.id,
          providersUsed: result.mergeMetadata.providersUsed,
        };
      } catch (error) {
        // Reset status on failure
        await ctx.db
          .update(syllabusNodes)
          .set({ tutorialStatus: "error", updatedAt: new Date() })
          .where(eq(syllabusNodes.id, input.nodeId));
        throw error;
      }
    },
  ),

  // ─── Get Tutorial for Node ───
  getTutorial: protectedProcedure.input(z.object({ nodeId: z.number().int().positive() })).query(
    async ({
      ctx,
      input,
    }): Promise<{
      id: number;
      title: string;
      content: TutorialContent;
      contentText: string;
      providersUsed: string[];
      version: number;
      wordCount: number | null;
      estimatedReadMinutes: number | null;
      createdAt: Date;
    } | null> => {
      const [tutorial] = await ctx.db
        .select({
          id: tutorials.id,
          title: tutorials.title,
          content: tutorials.content,
          contentText: tutorials.contentText,
          providersUsed: tutorials.providersUsed,
          version: tutorials.version,
          wordCount: tutorials.wordCount,
          estimatedReadMinutes: tutorials.estimatedReadMinutes,
          createdAt: tutorials.createdAt,
        })
        .from(tutorials)
        .where(and(eq(tutorials.syllabusNodeId, input.nodeId), eq(tutorials.isCurrent, true)))
        .limit(1);

      return tutorial ?? null;
    },
  ),

  // ─── Generate MCQs from Tutorial ───
  generateMCQs: protectedProcedure.input(generateMCQsInputSchema).mutation(
    async ({
      ctx,
      input,
    }): Promise<{
      questionsGenerated: number;
      providersUsed: string[];
    }> => {
      // 1. Fetch tutorial
      const [tutorial] = await ctx.db
        .select()
        .from(tutorials)
        .where(eq(tutorials.id, input.tutorialId))
        .limit(1);

      if (!tutorial) {
        throw new Error(`Tutorial ${input.tutorialId} not found`);
      }

      // 2. Get exam name
      const [exam] = await ctx.db
        .select({ name: exams.name })
        .from(exams)
        .where(eq(exams.id, tutorial.examId))
        .limit(1);

      // 3. Update node status
      await ctx.db
        .update(syllabusNodes)
        .set({ mcqStatus: "generating", updatedAt: new Date() })
        .where(eq(syllabusNodes.id, input.nodeId));

      try {
        // 4. Compute difficulty mix
        const difficultyMix =
          input.difficulty === "mixed"
            ? { easy: 30, medium: 50, hard: 20 }
            : {
                easy: input.difficulty === "easy" ? 100 : 0,
                medium: input.difficulty === "medium" ? 100 : 0,
                hard: input.difficulty === "hard" ? 100 : 0,
              };

        // 5. Build prompt
        const { systemPrompt, prompt } = buildMCQFromTutorialPrompt({
          examName: exam!.name,
          tutorialTitle: tutorial.title,
          tutorialContentText: tutorial.contentText,
          count: input.count,
          difficultyMix,
        });

        // 6. Call multi-agent
        const result = await multiAgentRequest(
          {
            task: "generate_mcq_from_tutorial",
            providers: input.providers as AIProviderId[],
            prompt,
            systemPrompt,
            schema: generatedQuestionsResponseSchema,
            mergeStrategy: "best_of",
            userId: ctx.userId,
            examId: tutorial.examId,
          },
          ctx.db,
        );

        // 7. Insert questions and link to tutorial/node
        const generatedQuestions = result.merged;
        const questionsList = Array.isArray(generatedQuestions)
          ? generatedQuestions
          : ((generatedQuestions as { questions: unknown[] }).questions ?? []);

        let insertedCount = 0;

        for (const q of questionsList) {
          const qData = q as {
            question: string;
            options: string[];
            answer: number;
            explanation: string;
            subject: string;
            difficulty: string;
            type?: string;
          };

          // Insert into questions table
          const [inserted] = await ctx.db
            .insert(questions)
            .values({
              examId: tutorial.examId,
              type: "mcq",
              content: {
                type: "mcq",
                question: qData.question,
                options: qData.options,
                answer: qData.answer,
                explanation: qData.explanation,
              },
              subject: qData.subject,
              difficulty: (qData.difficulty as "easy" | "medium" | "hard") ?? "medium",
              source: `tutorial:${tutorial.id}`,
              orgId: ctx.orgId,
            })
            .returning({ id: questions.id });

          // Link in junction table
          await ctx.db.insert(tutorialQuestions).values({
            tutorialId: tutorial.id,
            questionId: inserted!.id,
            syllabusNodeId: input.nodeId,
          });

          insertedCount++;
        }

        // 8. Update node status
        await ctx.db
          .update(syllabusNodes)
          .set({
            mcqStatus: "generated",
            mcqCount: sql`${syllabusNodes.mcqCount} + ${insertedCount}`,
            updatedAt: new Date(),
          })
          .where(eq(syllabusNodes.id, input.nodeId));

        return {
          questionsGenerated: insertedCount,
          providersUsed: result.mergeMetadata.providersUsed,
        };
      } catch (error) {
        await ctx.db
          .update(syllabusNodes)
          .set({ mcqStatus: "error", updatedAt: new Date() })
          .where(eq(syllabusNodes.id, input.nodeId));
        throw error;
      }
    },
  ),

  // ─── Get Questions for Node ───
  getNodeQuestions: protectedProcedure
    .input(z.object({ nodeId: z.number().int().positive() }))
    .query(
      async ({
        ctx,
        input,
      }): Promise<
        Array<{
          id: string;
          type: string;
          content: Record<string, unknown>;
          subject: string;
          difficulty: string;
          createdAt: Date;
        }>
      > => {
        const rows = await ctx.db
          .select({
            id: questions.id,
            type: questions.type,
            content: questions.content,
            subject: questions.subject,
            difficulty: questions.difficulty,
            createdAt: questions.createdAt,
          })
          .from(tutorialQuestions)
          .innerJoin(questions, eq(tutorialQuestions.questionId, questions.id))
          .where(eq(tutorialQuestions.syllabusNodeId, input.nodeId))
          .orderBy(questions.createdAt);

        return rows;
      },
    ),

  // ─── Get Topics for Exam (for autocomplete in generate form) ───
  getTopicsForExam: protectedProcedure
    .input(
      z.object({
        examId: z.string().uuid(),
        search: z.string().max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Find processed syllabi for this exam
      const syllabusRows = await ctx.db
        .select({ id: syllabi.id })
        .from(syllabi)
        .where(and(eq(syllabi.examId, input.examId), eq(syllabi.status, "parsed")));

      if (syllabusRows.length === 0) return [];

      const syllabusIds = syllabusRows.map((r) => r.id);

      const conditions = [
        inArray(syllabusNodes.syllabusId, syllabusIds),
        gte(syllabusNodes.depth, 2),
      ];

      if (input.search) {
        conditions.push(ilike(syllabusNodes.title, `%${input.search}%`));
      }

      const nodes = await ctx.db
        .select({
          nodeId: syllabusNodes.id,
          title: syllabusNodes.title,
          depth: syllabusNodes.depth,
          nodeType: syllabusNodes.nodeType,
          parentId: syllabusNodes.parentId,
          tutorialStatus: syllabusNodes.tutorialStatus,
        })
        .from(syllabusNodes)
        .where(and(...conditions))
        .orderBy(syllabusNodes.depth, syllabusNodes.sortOrder)
        .limit(50);

      // Batch-fetch parent titles
      const parentIds = [...new Set(nodes.map((n) => n.parentId).filter(Boolean))] as number[];
      const parentMap = new Map<number, string>();
      if (parentIds.length > 0) {
        const parents = await ctx.db
          .select({ id: syllabusNodes.id, title: syllabusNodes.title })
          .from(syllabusNodes)
          .where(inArray(syllabusNodes.id, parentIds));
        for (const p of parents) parentMap.set(p.id, p.title);
      }

      return nodes.map((n) => ({
        nodeId: n.nodeId,
        title: n.title,
        depth: n.depth,
        nodeType: n.nodeType,
        parentTitle: n.parentId ? (parentMap.get(n.parentId) ?? null) : null,
        hasTutorial:
          n.tutorialStatus === "generated" ||
          n.tutorialStatus === "approved" ||
          n.tutorialStatus === "published",
      }));
    }),

  // ─── Get Topic Content for Syllabus-Aware Generation ───
  getTopicContent: protectedProcedure
    .input(
      z.object({
        nodeId: z.number().int().positive().optional(),
        examId: z.string().uuid().optional(),
        topicTitle: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<string | null> => {
      let nodeId = input.nodeId;

      // If no nodeId, try to find by examId + topicTitle
      if (!nodeId && input.examId && input.topicTitle) {
        const syllabusRows = await ctx.db
          .select({ id: syllabi.id })
          .from(syllabi)
          .where(and(eq(syllabi.examId, input.examId), eq(syllabi.status, "parsed")));

        if (syllabusRows.length === 0) return null;

        const [matchingNode] = await ctx.db
          .select({ id: syllabusNodes.id })
          .from(syllabusNodes)
          .where(
            and(
              inArray(
                syllabusNodes.syllabusId,
                syllabusRows.map((r) => r.id),
              ),
              ilike(syllabusNodes.title, `%${input.topicTitle}%`),
            ),
          )
          .limit(1);

        if (!matchingNode) return null;
        nodeId = matchingNode.id;
      }

      if (!nodeId) return null;

      // Get node content
      const [node] = await ctx.db
        .select({
          content: syllabusNodes.content,
          description: syllabusNodes.description,
        })
        .from(syllabusNodes)
        .where(eq(syllabusNodes.id, nodeId))
        .limit(1);

      // Get tutorial content if available
      const [tutorial] = await ctx.db
        .select({ contentText: tutorials.contentText })
        .from(tutorials)
        .where(and(eq(tutorials.syllabusNodeId, nodeId), eq(tutorials.isCurrent, true)))
        .limit(1);

      const parts: string[] = [];
      if (node?.description) parts.push(node.description);
      if (node?.content) parts.push(node.content);
      if (tutorial?.contentText) parts.push(tutorial.contentText);

      if (parts.length === 0) return null;

      // Truncate to ~16000 chars to avoid exceeding token limits
      const combined = parts.join("\n\n");
      return combined.length > 16000 ? combined.substring(0, 16000) + "..." : combined;
    }),

  // ─── Create Exam from Selected Nodes ───
  createExamFromNodes: protectedProcedure
    .input(createExamFromNodesSchema)
    .mutation(async ({ ctx, input }): Promise<{ sessionId: string; questionCount: number }> => {
      // 1. Get all questions for selected nodes
      const availableQuestions = await ctx.db
        .select({
          questionId: tutorialQuestions.questionId,
          difficulty: questions.difficulty,
        })
        .from(tutorialQuestions)
        .innerJoin(questions, eq(tutorialQuestions.questionId, questions.id))
        .where(inArray(tutorialQuestions.syllabusNodeId, input.nodeIds));

      if (availableQuestions.length === 0) {
        throw new Error("No questions available for the selected nodes. Generate MCQs first.");
      }

      // 2. Select questions up to requested count
      let selectedIds: string[];

      if (input.difficultyMix) {
        selectedIds = selectByDifficulty(
          availableQuestions,
          input.questionCount,
          input.difficultyMix,
        );
      } else {
        // Random selection
        const shuffled = [...availableQuestions].sort(() => Math.random() - 0.5);
        selectedIds = shuffled.slice(0, input.questionCount).map((q) => q.questionId);
      }

      // 3. Create exam session
      const [session] = await ctx.db
        .insert(examSessions)
        .values({
          userId: ctx.userId,
          examId: availableQuestions[0]!.questionId
            ? ((
                await ctx.db
                  .select({ examId: questions.examId })
                  .from(questions)
                  .where(eq(questions.id, selectedIds[0]!))
                  .limit(1)
              ).at(0)?.examId ?? "")
            : "",
          questions: selectedIds,
          totalQuestions: selectedIds.length,
        })
        .returning({ id: examSessions.id });

      return {
        sessionId: session!.id,
        questionCount: selectedIds.length,
      };
    }),
});

// ─── Helper: Select questions by difficulty mix ───

function selectByDifficulty(
  available: Array<{ questionId: string; difficulty: string }>,
  total: number,
  mix: { easy: number; medium: number; hard: number },
): string[] {
  const byDifficulty: Record<string, string[]> = {
    easy: [],
    medium: [],
    hard: [],
  };

  for (const q of available) {
    byDifficulty[q.difficulty]?.push(q.questionId);
  }

  // Shuffle each bucket
  for (const key of Object.keys(byDifficulty)) {
    byDifficulty[key]!.sort(() => Math.random() - 0.5);
  }

  const sumPct = mix.easy + mix.medium + mix.hard;
  const easyCount = Math.round((mix.easy / sumPct) * total);
  const hardCount = Math.round((mix.hard / sumPct) * total);
  const mediumCount = total - easyCount - hardCount;

  const selected = [
    ...byDifficulty["easy"]!.slice(0, easyCount),
    ...byDifficulty["medium"]!.slice(0, mediumCount),
    ...byDifficulty["hard"]!.slice(0, hardCount),
  ];

  // Fill remaining from any bucket if we're short
  if (selected.length < total) {
    const used = new Set(selected);
    for (const q of available) {
      if (selected.length >= total) break;
      if (!used.has(q.questionId)) {
        selected.push(q.questionId);
        used.add(q.questionId);
      }
    }
  }

  return selected;
}
