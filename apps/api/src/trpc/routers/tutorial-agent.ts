import { eq, and, desc, sql } from "drizzle-orm";
import {
  tutorialFiles,
  tutorialGenerationJobs,
  userGeneratedExams,
  syllabusNodes,
  syllabi,
  exams,
} from "@examforge/shared/db/schema";
import {
  startTutorialGenerationSchema,
  tutorialJobIdSchema,
  regenerateTopicSchema,
  getTutorialForNodeSchema,
  listTutorialsForSyllabusSchema,
  generateUserExamSchema,
  listUserExamsSchema,
  getUserExamByIdSchema,
  deleteUserExamSchema,
  generatedQuestionsResponseSchema,
} from "@examforge/shared/validators";
import { router, protectedProcedure, adminProcedure } from "../trpc.js";
import { addTutorialAgentJob } from "../../queues/tutorial-agent-queue.js";
import { getTutorialStorage } from "../../services/tutorial-storage.js";
import { routeTextRequest } from "../../ai/ai-router.js";
import { multiAgentRequest } from "../../ai/multi-agent.js";
import {
  buildTutorialHtmlSystemPrompt,
  buildTutorialHtmlUserPrompt,
  getExamTextbooks,
} from "../../ai/prompts/tutorial-html-prompt.js";
import { buildMCQFromTutorialPrompt } from "../../ai/prompts/tutorial-to-mcq.js";
import {
  assembleTutorial,
  assemblePreview,
  extractMetadataFromFragment,
} from "../../services/tutorial-html-generator.js";
import type { AIProviderId } from "../../ai/types.js";
import { PROVIDER_ID_TO_AI_PROVIDER } from "../../ai/types.js";

// ─── Tutorial Agent Router ───

export const tutorialAgentRouter = router({
  // ═══ ADMIN: List exams that have at least one parsed syllabus ═══
  listExamsWithSyllabi: adminProcedure.query(
    async ({
      ctx,
    }): Promise<Array<{ id: string; name: string; conductingBody: string | null }>> => {
      const rows = await ctx.db
        .selectDistinctOn([exams.id], {
          id: exams.id,
          name: exams.name,
          conductingBody: exams.conductingBody,
        })
        .from(exams)
        .innerJoin(syllabi, eq(syllabi.examId, exams.id))
        .where(eq(syllabi.status, "parsed"))
        .orderBy(exams.id, exams.name);

      return rows;
    },
  ),

  // ═══ ADMIN: Start batch generation ═══
  startGeneration: adminProcedure
    .input(startTutorialGenerationSchema)
    .mutation(async ({ ctx, input }): Promise<{ jobId: number; queueJobId: string }> => {
      // Count leaf nodes for this syllabus
      const allNodes = await ctx.db
        .select({
          id: syllabusNodes.id,
          parentId: syllabusNodes.parentId,
          nodeType: syllabusNodes.nodeType,
        })
        .from(syllabusNodes)
        .where(eq(syllabusNodes.syllabusId, input.syllabusId));

      const parentIds = new Set(
        allNodes.filter((n) => n.parentId !== null).map((n) => n.parentId!),
      );
      const leafCount = allNodes.filter(
        (n) => !parentIds.has(n.id) && n.nodeType !== "unit",
      ).length;

      if (leafCount === 0) {
        throw new Error("No topics found in this syllabus to generate tutorials for.");
      }

      // Create job record
      const [job] = await ctx.db
        .insert(tutorialGenerationJobs)
        .values({
          syllabusId: input.syllabusId,
          examId: input.examId,
          status: "queued",
          totalNodes: leafCount,
          aiProviders: input.providers,
          generatePreviews: input.generatePreviews,
          previewPercentage: input.previewPercentage,
          includeDiagrams: input.includeDiagrams,
          includeMnemonics: input.includeMnemonics,
          includeReferences: input.includeReferences,
          createdBy: ctx.userId,
        })
        .returning({ id: tutorialGenerationJobs.id });

      // Queue BullMQ job
      const queueJobId = await addTutorialAgentJob({
        jobId: job!.id,
        syllabusId: input.syllabusId,
        examId: input.examId,
        providers: input.providers,
        generatePreviews: input.generatePreviews,
        previewPercentage: input.previewPercentage,
        includeDiagrams: input.includeDiagrams,
        includeMnemonics: input.includeMnemonics,
        includeReferences: input.includeReferences,
        userId: ctx.userId,
        retryFailedOnly: false,
      });

      return { jobId: job!.id, queueJobId };
    }),

  // ═══ ADMIN: Pause generation ═══
  pauseGeneration: adminProcedure
    .input(tutorialJobIdSchema)
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      await ctx.db
        .update(tutorialGenerationJobs)
        .set({ status: "paused", updatedAt: new Date() })
        .where(eq(tutorialGenerationJobs.id, input.jobId));
      return { success: true };
    }),

  // ═══ ADMIN: Resume generation ═══
  resumeGeneration: adminProcedure
    .input(tutorialJobIdSchema)
    .mutation(async ({ ctx, input }): Promise<{ queueJobId: string }> => {
      const [job] = await ctx.db
        .select()
        .from(tutorialGenerationJobs)
        .where(eq(tutorialGenerationJobs.id, input.jobId))
        .limit(1);

      if (!job) throw new Error("Job not found");

      // Re-queue the job
      await ctx.db
        .update(tutorialGenerationJobs)
        .set({ status: "queued", updatedAt: new Date() })
        .where(eq(tutorialGenerationJobs.id, input.jobId));

      const queueJobId = await addTutorialAgentJob({
        jobId: job.id,
        syllabusId: job.syllabusId,
        examId: job.examId,
        providers: job.aiProviders as string[],
        generatePreviews: job.generatePreviews ?? true,
        previewPercentage: job.previewPercentage ?? 30,
        includeDiagrams: job.includeDiagrams ?? true,
        includeMnemonics: job.includeMnemonics ?? true,
        includeReferences: job.includeReferences ?? true,
        userId: ctx.userId,
        retryFailedOnly: false,
      });

      return { queueJobId };
    }),

  // ═══ ADMIN: Retry failed tutorials from a completed/error job ═══
  retryFailed: adminProcedure
    .input(tutorialJobIdSchema)
    .mutation(
      async ({
        ctx,
        input,
      }): Promise<{ jobId: number; queueJobId: string; failedCount: number }> => {
        // Load the original job
        const [originalJob] = await ctx.db
          .select()
          .from(tutorialGenerationJobs)
          .where(eq(tutorialGenerationJobs.id, input.jobId))
          .limit(1);

        if (!originalJob) throw new Error("Job not found");

        if (originalJob.status !== "completed" && originalJob.status !== "error") {
          throw new Error("Can only retry failed tutorials from completed or errored jobs");
        }

        const failedCount = originalJob.failedNodes ?? 0;
        if (failedCount === 0) {
          throw new Error("No failed tutorials to retry");
        }

        // Create a new job record for the retry
        const [newJob] = await ctx.db
          .insert(tutorialGenerationJobs)
          .values({
            syllabusId: originalJob.syllabusId,
            examId: originalJob.examId,
            totalNodes: failedCount,
            status: "queued",
            aiProviders: originalJob.aiProviders,
            generatePreviews: originalJob.generatePreviews,
            previewPercentage: originalJob.previewPercentage,
            includeDiagrams: originalJob.includeDiagrams,
            includeMnemonics: originalJob.includeMnemonics,
            includeReferences: originalJob.includeReferences,
            createdBy: ctx.userId,
          })
          .returning({ id: tutorialGenerationJobs.id });

        // Queue the retry job with retryFailedOnly flag
        const queueJobId = await addTutorialAgentJob({
          jobId: newJob!.id,
          syllabusId: originalJob.syllabusId,
          examId: originalJob.examId,
          providers: originalJob.aiProviders as string[],
          generatePreviews: originalJob.generatePreviews ?? true,
          previewPercentage: originalJob.previewPercentage ?? 30,
          includeDiagrams: originalJob.includeDiagrams ?? true,
          includeMnemonics: originalJob.includeMnemonics ?? true,
          includeReferences: originalJob.includeReferences ?? true,
          userId: ctx.userId,
          retryFailedOnly: true,
        });

        return { jobId: newJob!.id, queueJobId, failedCount };
      },
    ),

  // ═══ ADMIN: Get generation status ═══
  getGenerationStatus: adminProcedure.input(tutorialJobIdSchema).query(
    async ({
      ctx,
      input,
    }): Promise<{
      id: number;
      status: string;
      totalNodes: number;
      completedNodes: number | null;
      failedNodes: number | null;
      currentNodeTitle: string | null;
      totalTokens: number | null;
      totalCostUsd: number | null;
      startedAt: Date | null;
      completedAt: Date | null;
      errorLog: unknown;
    }> => {
      const [job] = await ctx.db
        .select({
          id: tutorialGenerationJobs.id,
          status: tutorialGenerationJobs.status,
          totalNodes: tutorialGenerationJobs.totalNodes,
          completedNodes: tutorialGenerationJobs.completedNodes,
          failedNodes: tutorialGenerationJobs.failedNodes,
          currentNodeTitle: tutorialGenerationJobs.currentNodeTitle,
          totalTokens: tutorialGenerationJobs.totalTokens,
          totalCostUsd: tutorialGenerationJobs.totalCostUsd,
          startedAt: tutorialGenerationJobs.startedAt,
          completedAt: tutorialGenerationJobs.completedAt,
          errorLog: tutorialGenerationJobs.errorLog,
        })
        .from(tutorialGenerationJobs)
        .where(eq(tutorialGenerationJobs.id, input.jobId))
        .limit(1);

      if (!job) throw new Error("Job not found");
      return job;
    },
  ),

  // ═══ ADMIN: Regenerate single topic ═══
  regenerateTopic: adminProcedure
    .input(regenerateTopicSchema)
    .mutation(async ({ ctx, input }): Promise<{ tutorialFileId: number }> => {
      const [existing] = await ctx.db
        .select()
        .from(tutorialFiles)
        .where(eq(tutorialFiles.id, input.tutorialFileId))
        .limit(1);

      if (!existing) throw new Error("Tutorial file not found");

      // Get node, exam, syllabus context
      const [node] = await ctx.db
        .select()
        .from(syllabusNodes)
        .where(eq(syllabusNodes.id, existing.syllabusNodeId))
        .limit(1);

      if (!node) throw new Error("Syllabus node not found");

      const [exam] = await ctx.db
        .select({ name: exams.name, conductingBody: exams.conductingBody })
        .from(exams)
        .where(eq(exams.id, existing.examId))
        .limit(1);

      if (!exam) throw new Error("Exam not found");

      // Get parent node
      let parentTitle = "General";
      if (node.parentId) {
        const [parent] = await ctx.db
          .select({ title: syllabusNodes.title })
          .from(syllabusNodes)
          .where(eq(syllabusNodes.id, node.parentId))
          .limit(1);
        parentTitle = parent?.title ?? "General";
      }

      // Load syllabus raw text for context
      await ctx.db
        .select({ rawText: syllabi.rawText })
        .from(syllabi)
        .where(eq(syllabi.id, existing.syllabusId))
        .limit(1);

      // Generate new HTML
      const systemPrompt = buildTutorialHtmlSystemPrompt();
      const prompt = buildTutorialHtmlUserPrompt({
        examName: exam.name,
        conductingBody: exam.conductingBody ?? exam.name,
        unitTitle: parentTitle,
        topicTitle: node.title,
        nodeDescription: node.description ?? "",
        keyTerms: (node.keyTerms as string[]) ?? [],
        difficulty: "Medium",
        prevTopic: "",
        nextTopic: "",
        rawTextSection: "",
        textbookList: getExamTextbooks(exam.name),
      });

      const providerId = (input.providers[0] ?? "claude") as AIProviderId;
      const result = await routeTextRequest(
        {
          task: "generate_tutorial_html",
          prompt,
          systemPrompt,
          userId: ctx.userId,
          examId: existing.examId,
          overrideProvider: PROVIDER_ID_TO_AI_PROVIDER[providerId],
          maxTokens: 8192,
        },
        ctx.db,
      );

      const fragment = result.data;
      const metadata = extractMetadataFromFragment(fragment);

      const fullHtml = assembleTutorial({
        fragment,
        title: node.title,
        subject: exam.name,
        unitName: parentTitle,
        topicName: node.title,
        estimatedTime: metadata.estimatedReadMinutes,
        difficulty: "Medium",
        progressPercent: 0,
        prevTopicUrl: "#",
        nextTopicUrl: "#",
      });

      const storage = getTutorialStorage();
      await storage.upload(existing.fileKey, fullHtml);

      if (existing.previewFileKey) {
        const previewHtml = assemblePreview({
          fullHtml,
          previewPercentage: existing.freePreviewPercentage ?? 30,
        });
        await storage.upload(existing.previewFileKey, previewHtml);
      }

      // Mark old as not current, insert new version
      const nextVersion = (existing.version ?? 1) + 1;
      await ctx.db
        .update(tutorialFiles)
        .set({ isCurrent: false, updatedAt: new Date() })
        .where(
          and(
            eq(tutorialFiles.syllabusNodeId, existing.syllabusNodeId),
            eq(tutorialFiles.isCurrent, true),
          ),
        );

      const [newRecord] = await ctx.db
        .insert(tutorialFiles)
        .values({
          syllabusNodeId: existing.syllabusNodeId,
          syllabusId: existing.syllabusId,
          examId: existing.examId,
          fileKey: existing.fileKey,
          fileUrl: existing.fileUrl,
          previewFileKey: existing.previewFileKey,
          previewFileUrl: existing.previewFileUrl,
          fileSizeBytes: Buffer.byteLength(fullHtml, "utf-8"),
          title: node.title,
          wordCount: metadata.wordCount,
          estimatedReadMinutes: metadata.estimatedReadMinutes,
          sectionsCount: metadata.sectionsCount,
          hasDiagrams: metadata.hasDiagrams,
          hasFormulas: metadata.hasFormulas,
          hasTables: metadata.hasTables,
          hasMnemonics: metadata.hasMnemonics,
          keyTerms: metadata.keyTerms,
          version: nextVersion,
          isCurrent: true,
          generatedBy: "regenerated",
          aiProvidersUsed: [providerId],
          aiTokensUsed: result.usage.totalTokens,
          aiCostUsd: result.estimatedCostUsd,
        })
        .returning({ id: tutorialFiles.id });

      return { tutorialFileId: newRecord!.id };
    }),

  // ═══ USER: Get tutorial for a node ═══
  getTutorialForNode: protectedProcedure.input(getTutorialForNodeSchema).query(
    async ({
      ctx,
      input,
    }): Promise<{
      html: string;
      isPreview: boolean;
      isLocked: boolean;
      meta: {
        id: number;
        title: string;
        wordCount: number | null;
        estimatedReadMinutes: number | null;
        sectionsCount: number | null;
        version: number;
      };
    } | null> => {
      const [tutorial] = await ctx.db
        .select()
        .from(tutorialFiles)
        .where(
          and(
            eq(tutorialFiles.syllabusNodeId, input.syllabusNodeId),
            eq(tutorialFiles.isCurrent, true),
          ),
        )
        .limit(1);

      if (!tutorial) return null;

      const storage = getTutorialStorage();

      // For now, serve full content to all authenticated users
      // TODO: Add plan-based access control (free preview, quota, credits)
      let html: string;
      let isPreview = false;
      const isLocked = false;

      try {
        html = await storage.download(tutorial.fileKey);
      } catch {
        // Fall back to preview if full file not found
        if (tutorial.previewFileKey) {
          try {
            html = await storage.download(tutorial.previewFileKey);
            isPreview = true;
          } catch {
            return null;
          }
        } else {
          return null;
        }
      }

      // Increment view count
      await ctx.db
        .update(tutorialFiles)
        .set({
          totalViews: sql`${tutorialFiles.totalViews} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(tutorialFiles.id, tutorial.id));

      return {
        html,
        isPreview,
        isLocked,
        meta: {
          id: tutorial.id,
          title: tutorial.title,
          wordCount: tutorial.wordCount,
          estimatedReadMinutes: tutorial.estimatedReadMinutes,
          sectionsCount: tutorial.sectionsCount,
          version: tutorial.version,
        },
      };
    },
  ),

  // ═══ USER: Get tutorial metadata ═══
  getTutorialMeta: protectedProcedure.input(getTutorialForNodeSchema).query(
    async ({
      ctx,
      input,
    }): Promise<{
      id: number;
      title: string;
      wordCount: number | null;
      estimatedReadMinutes: number | null;
      sectionsCount: number | null;
      hasDiagrams: boolean | null;
      hasFormulas: boolean | null;
      hasTables: boolean | null;
      version: number;
      createdAt: Date;
    } | null> => {
      const [tutorial] = await ctx.db
        .select({
          id: tutorialFiles.id,
          title: tutorialFiles.title,
          wordCount: tutorialFiles.wordCount,
          estimatedReadMinutes: tutorialFiles.estimatedReadMinutes,
          sectionsCount: tutorialFiles.sectionsCount,
          hasDiagrams: tutorialFiles.hasDiagrams,
          hasFormulas: tutorialFiles.hasFormulas,
          hasTables: tutorialFiles.hasTables,
          version: tutorialFiles.version,
          createdAt: tutorialFiles.createdAt,
        })
        .from(tutorialFiles)
        .where(
          and(
            eq(tutorialFiles.syllabusNodeId, input.syllabusNodeId),
            eq(tutorialFiles.isCurrent, true),
          ),
        )
        .limit(1);

      return tutorial ?? null;
    },
  ),

  // ═══ USER: List tutorials for syllabus ═══
  listTutorialsForSyllabus: protectedProcedure.input(listTutorialsForSyllabusSchema).query(
    async ({
      ctx,
      input,
    }): Promise<
      Array<{
        id: number;
        syllabusNodeId: number;
        title: string;
        wordCount: number | null;
        estimatedReadMinutes: number | null;
        sectionsCount: number | null;
        version: number;
        createdAt: Date;
      }>
    > => {
      const tutorials = await ctx.db
        .select({
          id: tutorialFiles.id,
          syllabusNodeId: tutorialFiles.syllabusNodeId,
          title: tutorialFiles.title,
          wordCount: tutorialFiles.wordCount,
          estimatedReadMinutes: tutorialFiles.estimatedReadMinutes,
          sectionsCount: tutorialFiles.sectionsCount,
          version: tutorialFiles.version,
          createdAt: tutorialFiles.createdAt,
        })
        .from(tutorialFiles)
        .where(
          and(eq(tutorialFiles.syllabusId, input.syllabusId), eq(tutorialFiles.isCurrent, true)),
        )
        .orderBy(tutorialFiles.createdAt);

      return tutorials;
    },
  ),

  // ═══ USER: Generate personal exam from tutorial ═══
  generateUserExam: protectedProcedure
    .input(generateUserExamSchema)
    .mutation(async ({ ctx, input }): Promise<{ examId: number; questionCount: number }> => {
      // 1. Load tutorial
      const [tutorial] = await ctx.db
        .select()
        .from(tutorialFiles)
        .where(eq(tutorialFiles.id, input.tutorialFileId))
        .limit(1);

      if (!tutorial) throw new Error("Tutorial not found");

      // 2. Load HTML and strip to plain text
      const storage = getTutorialStorage();
      const html = await storage.download(tutorial.fileKey);
      const plainText = html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      // 3. Get exam name
      const [exam] = await ctx.db
        .select({ name: exams.name })
        .from(exams)
        .where(eq(exams.id, tutorial.examId))
        .limit(1);

      // 4. Build MCQ prompt
      const difficultyMix =
        input.difficulty === "mixed"
          ? { easy: 30, medium: 50, hard: 20 }
          : {
              easy: input.difficulty === "easy" ? 100 : 0,
              medium: input.difficulty === "medium" ? 100 : 0,
              hard: input.difficulty === "hard" ? 100 : 0,
            };

      const { systemPrompt, prompt } = buildMCQFromTutorialPrompt({
        examName: exam!.name,
        tutorialTitle: tutorial.title,
        tutorialContentText: plainText.substring(0, 50000), // Max 50KB
        count: input.questionCount,
        difficultyMix,
      });

      // 5. Call AI
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

      // 6. Parse questions
      const generatedQuestions = result.merged;
      const questionsList = Array.isArray(generatedQuestions)
        ? generatedQuestions
        : ((generatedQuestions as { questions: unknown[] }).questions ?? []);

      const formattedQuestions = questionsList.map((q, i) => {
        const qData = q as {
          question: string;
          options: string[];
          answer: number;
          explanation: string;
          subject?: string;
          difficulty?: string;
        };
        return {
          question: qData.question,
          options: qData.options,
          answer: qData.answer,
          explanation: qData.explanation,
          difficulty: (qData.difficulty ?? "medium") as "easy" | "medium" | "hard",
          subject: qData.subject ?? tutorial.title,
          questionNumber: i + 1,
        };
      });

      // Count difficulties
      const diffDist = { easy: 0, medium: 0, hard: 0 };
      for (const q of formattedQuestions) {
        diffDist[q.difficulty]++;
      }

      // 7. Save to user_generated_exams
      const [userExam] = await ctx.db
        .insert(userGeneratedExams)
        .values({
          userId: ctx.userId,
          examId: tutorial.examId,
          syllabusNodeId: input.syllabusNodeId,
          title: `${tutorial.title} — Practice Exam`,
          description: `Auto-generated practice exam from tutorial: ${tutorial.title}`,
          questions: formattedQuestions,
          questionCount: formattedQuestions.length,
          difficultyDistribution: diffDist,
          timeLimitMinutes: input.timeLimitMinutes ?? Math.ceil(formattedQuestions.length * 1.5),
          aiProvider: result.mergeMetadata.providersUsed[0] ?? "claude",
          aiTokensUsed: result.mergeMetadata.providersUsed.reduce(
            (acc, p) =>
              acc +
              (result.perProvider[p]?.tokensUsed.input ?? 0) +
              (result.perProvider[p]?.tokensUsed.output ?? 0),
            0,
          ),
          aiCostUsd: result.mergeMetadata.totalCostUsd,
          sourceTutorialId: tutorial.id,
          ownerType: "user",
          ownerId: ctx.userId,
        })
        .returning({ id: userGeneratedExams.id });

      return {
        examId: userExam!.id,
        questionCount: formattedQuestions.length,
      };
    }),

  // ═══ USER: List personal exams ═══
  listUserExams: protectedProcedure.input(listUserExamsSchema).query(
    async ({
      ctx,
      input,
    }): Promise<
      Array<{
        id: number;
        title: string;
        questionCount: number;
        timesAttempted: number | null;
        bestScore: number | null;
        lastAttemptedAt: Date | null;
        createdAt: Date;
      }>
    > => {
      const conditions = [eq(userGeneratedExams.userId, ctx.userId)];
      if (input.examId) {
        conditions.push(eq(userGeneratedExams.examId, input.examId));
      }
      if (input.syllabusNodeId) {
        conditions.push(eq(userGeneratedExams.syllabusNodeId, input.syllabusNodeId));
      }

      return ctx.db
        .select({
          id: userGeneratedExams.id,
          title: userGeneratedExams.title,
          questionCount: userGeneratedExams.questionCount,
          timesAttempted: userGeneratedExams.timesAttempted,
          bestScore: userGeneratedExams.bestScore,
          lastAttemptedAt: userGeneratedExams.lastAttemptedAt,
          createdAt: userGeneratedExams.createdAt,
        })
        .from(userGeneratedExams)
        .where(and(...conditions))
        .orderBy(desc(userGeneratedExams.createdAt));
    },
  ),

  // ═══ USER: Get personal exam by ID ═══
  getUserExamById: protectedProcedure.input(getUserExamByIdSchema).query(
    async ({
      ctx,
      input,
    }): Promise<{
      id: number;
      title: string;
      description: string | null;
      questions: unknown;
      questionCount: number;
      timeLimitMinutes: number | null;
      difficultyDistribution: unknown;
      timesAttempted: number | null;
      bestScore: number | null;
      createdAt: Date;
    } | null> => {
      const [exam] = await ctx.db
        .select({
          id: userGeneratedExams.id,
          title: userGeneratedExams.title,
          description: userGeneratedExams.description,
          questions: userGeneratedExams.questions,
          questionCount: userGeneratedExams.questionCount,
          timeLimitMinutes: userGeneratedExams.timeLimitMinutes,
          difficultyDistribution: userGeneratedExams.difficultyDistribution,
          timesAttempted: userGeneratedExams.timesAttempted,
          bestScore: userGeneratedExams.bestScore,
          createdAt: userGeneratedExams.createdAt,
          userId: userGeneratedExams.userId,
        })
        .from(userGeneratedExams)
        .where(eq(userGeneratedExams.id, input.id))
        .limit(1);

      if (!exam || exam.userId !== ctx.userId) return null;

      return {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        questions: exam.questions,
        questionCount: exam.questionCount,
        timeLimitMinutes: exam.timeLimitMinutes,
        difficultyDistribution: exam.difficultyDistribution,
        timesAttempted: exam.timesAttempted,
        bestScore: exam.bestScore,
        createdAt: exam.createdAt,
      };
    },
  ),

  // ═══ USER: Delete personal exam ═══
  deleteUserExam: protectedProcedure
    .input(deleteUserExamSchema)
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      const [exam] = await ctx.db
        .select({ userId: userGeneratedExams.userId })
        .from(userGeneratedExams)
        .where(eq(userGeneratedExams.id, input.id))
        .limit(1);

      if (!exam || exam.userId !== ctx.userId) {
        throw new Error("Exam not found or not owned by you");
      }

      await ctx.db.delete(userGeneratedExams).where(eq(userGeneratedExams.id, input.id));

      return { success: true };
    }),

  // ═══ ADMIN: List all generation jobs ═══
  listGenerationJobs: adminProcedure.query(
    async ({
      ctx,
    }): Promise<
      Array<{
        id: number;
        syllabusId: number;
        examId: string;
        status: string;
        totalNodes: number;
        completedNodes: number | null;
        failedNodes: number | null;
        totalCostUsd: number | null;
        startedAt: Date | null;
        completedAt: Date | null;
        createdAt: Date;
      }>
    > => {
      const jobs = await ctx.db
        .select({
          id: tutorialGenerationJobs.id,
          syllabusId: tutorialGenerationJobs.syllabusId,
          examId: tutorialGenerationJobs.examId,
          status: tutorialGenerationJobs.status,
          totalNodes: tutorialGenerationJobs.totalNodes,
          completedNodes: tutorialGenerationJobs.completedNodes,
          failedNodes: tutorialGenerationJobs.failedNodes,
          totalCostUsd: tutorialGenerationJobs.totalCostUsd,
          startedAt: tutorialGenerationJobs.startedAt,
          completedAt: tutorialGenerationJobs.completedAt,
          createdAt: tutorialGenerationJobs.createdAt,
        })
        .from(tutorialGenerationJobs)
        .orderBy(desc(tutorialGenerationJobs.createdAt));

      return jobs;
    },
  ),

  // ═══ ADMIN: List generated tutorials for browsing ═══
  listGeneratedTutorials: adminProcedure
    .input(
      listTutorialsForSyllabusSchema.extend({
        examId: getTutorialForNodeSchema.shape.syllabusNodeId.optional(),
      }),
    )
    .query(
      async ({
        ctx,
        input,
      }): Promise<
        Array<{
          id: number;
          syllabusNodeId: number;
          title: string;
          wordCount: number | null;
          sectionsCount: number | null;
          estimatedReadMinutes: number | null;
          version: number;
          createdAt: Date;
        }>
      > => {
        const tutorials = await ctx.db
          .select({
            id: tutorialFiles.id,
            syllabusNodeId: tutorialFiles.syllabusNodeId,
            title: tutorialFiles.title,
            wordCount: tutorialFiles.wordCount,
            sectionsCount: tutorialFiles.sectionsCount,
            estimatedReadMinutes: tutorialFiles.estimatedReadMinutes,
            version: tutorialFiles.version,
            createdAt: tutorialFiles.createdAt,
          })
          .from(tutorialFiles)
          .where(
            and(eq(tutorialFiles.syllabusId, input.syllabusId), eq(tutorialFiles.isCurrent, true)),
          )
          .orderBy(tutorialFiles.title);

        return tutorials;
      },
    ),
});
