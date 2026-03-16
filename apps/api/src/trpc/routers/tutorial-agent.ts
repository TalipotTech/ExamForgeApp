import { eq, and, desc, sql } from "drizzle-orm";
import {
  tutorialFiles,
  tutorialGenerationJobs,
  userGeneratedExams,
  syllabusNodes,
  syllabi,
  exams,
  topicNotes,
  type UserGeneratedQuestion,
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
  startUserExamSchema,
  submitUserExamSchema,
  generateMultiTopicExamSchema,
  generateBatchExamsSchema,
  generatedQuestionsResponseSchema,
  generateExamFromNotesSchema,
} from "@examforge/shared/validators";
import { createHash } from "crypto";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../trpc.js";
import { addTutorialAgentJob } from "../../queues/tutorial-agent-queue.js";
import { getTutorialStorage } from "../../services/tutorial-storage.js";
import { checkExamQuota, incrementExamCount } from "../../services/subscription-guard.js";
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

// ─── Helpers ───

type RawQuestionData = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  subject?: string;
  difficulty?: string;
};

/**
 * Normalise a single AI-generated question object.
 * AI providers sometimes wrap the question data inside a `content` property
 * (e.g. `{ content: { type: "mcq", question: "..." } }`). This function
 * unwraps that layer and validates the minimum required fields.
 */
function normaliseQuestion(raw: unknown): RawQuestionData | null {
  if (!raw || typeof raw !== "object") return null;

  // Unwrap nested `content` wrapper (common AI response pattern)
  let data = raw as Record<string, unknown>;
  if ("content" in data && typeof data.content === "object" && data.content !== null) {
    data = data.content as Record<string, unknown>;
  }

  const question = typeof data.question === "string" ? data.question : "";
  const options = Array.isArray(data.options) ? (data.options as string[]) : [];
  const answer = typeof data.answer === "number" ? data.answer : 0;
  const explanation = typeof data.explanation === "string" ? data.explanation : "";
  const subject = typeof data.subject === "string" ? data.subject : undefined;
  const difficulty = typeof data.difficulty === "string" ? data.difficulty : undefined;

  if (!question || options.length < 2) return null;

  return { question, options, answer, explanation, subject, difficulty };
}

/**
 * Parse and validate an array of AI-generated questions, filtering out any
 * malformed entries and logging warnings for skipped items.
 */
function parseAIQuestions(
  questionsList: unknown[],
  defaultSubject: string,
): Array<{
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  subject: string;
  questionNumber: number;
}> {
  const formatted = questionsList
    .map((q, i) => {
      const qData = normaliseQuestion(q);
      if (!qData) {
        console.warn(
          `[ExamForge] Skipping malformed question at index ${i}:`,
          JSON.stringify(q).substring(0, 300),
        );
        return null;
      }
      return {
        question: qData.question,
        options: qData.options,
        answer: qData.answer,
        explanation: qData.explanation,
        difficulty: (qData.difficulty ?? "medium") as "easy" | "medium" | "hard",
        subject: qData.subject ?? defaultSubject,
        questionNumber: i + 1,
      };
    })
    .filter((q): q is NonNullable<typeof q> => q !== null);

  // Re-number after filtering
  formatted.forEach((q, i) => {
    q.questionNumber = i + 1;
  });

  return formatted;
}

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

  // ═══ USER: Get exam generation quota ═══
  getExamQuota: protectedProcedure.query(async ({ ctx }) => {
    const quota = await checkExamQuota(ctx.db as never, ctx.userId);
    return quota;
  }),

  // ═══ USER: Generate personal exam from tutorial ═══
  generateUserExam: protectedProcedure
    .input(generateUserExamSchema)
    .mutation(async ({ ctx, input }): Promise<{ examId: number; questionCount: number }> => {
      // 0. Check subscription quota
      const quota = await checkExamQuota(ctx.db as never, ctx.userId);
      if (!quota.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Exam generation limit reached (${quota.used}/${quota.limit} on ${quota.planName} plan). Upgrade to generate more exams.`,
        });
      }

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

      const formattedQuestions = parseAIQuestions(questionsList, tutorial.title);

      if (formattedQuestions.length === 0) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI returned no valid questions. Please try again.",
        });
      }

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

      // Increment quota counter
      await incrementExamCount(ctx.db as never, ctx.userId);

      return {
        examId: userExam!.id,
        questionCount: formattedQuestions.length,
      };
    }),

  // ═══ USER: Generate multi-topic exam ═══
  generateMultiTopicExam: protectedProcedure
    .input(generateMultiTopicExamSchema)
    .mutation(async ({ ctx, input }): Promise<{ examId: number; questionCount: number }> => {
      // Check subscription quota
      const quota = await checkExamQuota(ctx.db as never, ctx.userId);
      if (!quota.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Exam generation limit reached (${quota.used}/${quota.limit} on ${quota.planName} plan). Upgrade to generate more exams.`,
        });
      }

      const storage = getTutorialStorage();

      // Load tutorials for each selected node
      const tutorials = await ctx.db
        .select({
          id: tutorialFiles.id,
          syllabusNodeId: tutorialFiles.syllabusNodeId,
          title: tutorialFiles.title,
          fileKey: tutorialFiles.fileKey,
          examId: tutorialFiles.examId,
        })
        .from(tutorialFiles)
        .where(
          and(
            eq(tutorialFiles.syllabusId, input.syllabusId),
            eq(tutorialFiles.isCurrent, true),
            sql`${tutorialFiles.syllabusNodeId} IN (${sql.join(
              input.syllabusNodeIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        );

      if (tutorials.length === 0) throw new Error("No tutorials found for selected topics");

      // Get exam name
      const [exam] = await ctx.db
        .select({ name: exams.name })
        .from(exams)
        .where(eq(exams.id, tutorials[0]!.examId))
        .limit(1);

      // Download and concatenate content
      let combinedText = "";
      const topicTitles: string[] = [];
      for (const t of tutorials) {
        const html = await storage.download(t.fileKey);
        const text = html
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        topicTitles.push(t.title);
        combinedText += `\n\n--- TOPIC: ${t.title} ---\n${text}`;
        if (combinedText.length > 50000) break;
      }

      const totalQuestions = input.questionsPerTopic * tutorials.length;
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
        tutorialTitle: topicTitles.join(", "),
        tutorialContentText: combinedText.substring(0, 50000),
        count: totalQuestions,
        difficultyMix,
      });

      const result = await multiAgentRequest(
        {
          task: "generate_mcq_from_tutorial",
          providers: input.providers as AIProviderId[],
          prompt,
          systemPrompt,
          schema: generatedQuestionsResponseSchema,
          mergeStrategy: "best_of",
          userId: ctx.userId,
          examId: tutorials[0]!.examId,
        },
        ctx.db,
      );

      const generatedQuestions = result.merged;
      const questionsList = Array.isArray(generatedQuestions)
        ? generatedQuestions
        : ((generatedQuestions as { questions: unknown[] }).questions ?? []);

      const formattedQuestions = parseAIQuestions(questionsList, topicTitles[0] ?? "General");

      if (formattedQuestions.length === 0) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI returned no valid questions. Please try again.",
        });
      }

      const diffDist = { easy: 0, medium: 0, hard: 0 };
      for (const q of formattedQuestions) {
        diffDist[q.difficulty]++;
      }

      const hashes = formattedQuestions.map((q) =>
        createHash("md5").update(q.question.toLowerCase().trim()).digest("hex"),
      );

      const [userExam] = await ctx.db
        .insert(userGeneratedExams)
        .values({
          userId: ctx.userId,
          examId: tutorials[0]!.examId,
          syllabusNodeId: null,
          title: `Multi-Topic Exam — ${topicTitles.slice(0, 3).join(", ")}${topicTitles.length > 3 ? ` +${topicTitles.length - 3} more` : ""}`,
          description: `Practice exam from ${tutorials.length} topics: ${topicTitles.join(", ")}`,
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
          sourceNodeIds: input.syllabusNodeIds,
          questionHashes: hashes,
          ownerType: "user",
          ownerId: ctx.userId,
        })
        .returning({ id: userGeneratedExams.id });

      await incrementExamCount(ctx.db as never, ctx.userId);

      return {
        examId: userExam!.id,
        questionCount: formattedQuestions.length,
      };
    }),

  // ═══ USER: Generate batch exams (no repeat) ═══
  generateBatchExams: protectedProcedure
    .input(generateBatchExamsSchema)
    .mutation(async ({ ctx, input }): Promise<{ examIds: number[]; totalQuestions: number }> => {
      // Check subscription quota (need enough for all requested exams)
      const quota = await checkExamQuota(ctx.db as never, ctx.userId);
      const remaining = quota.limit - quota.used;
      if (remaining < input.count) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Not enough exam credits. Need ${input.count} but only ${remaining} remaining on ${quota.planName} plan.`,
        });
      }

      const [tutorial] = await ctx.db
        .select()
        .from(tutorialFiles)
        .where(eq(tutorialFiles.id, input.tutorialFileId))
        .limit(1);

      if (!tutorial) throw new Error("Tutorial not found");

      const storage = getTutorialStorage();
      const html = await storage.download(tutorial.fileKey);
      const plainText = html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const [exam] = await ctx.db
        .select({ name: exams.name })
        .from(exams)
        .where(eq(exams.id, tutorial.examId))
        .limit(1);

      // Load existing question hashes for dedup
      const existingExams = await ctx.db
        .select({
          questionHashes: userGeneratedExams.questionHashes,
          questions: userGeneratedExams.questions,
        })
        .from(userGeneratedExams)
        .where(
          and(
            eq(userGeneratedExams.userId, ctx.userId),
            eq(userGeneratedExams.sourceTutorialId, input.tutorialFileId),
          ),
        );

      const allExcludedHashes = new Set<string>();
      const allExcludedQuestions: string[] = [];

      for (const e of existingExams) {
        if (e.questionHashes) {
          for (const h of e.questionHashes as string[]) allExcludedHashes.add(h);
        }
        if (e.questions) {
          for (const q of e.questions as UserGeneratedQuestion[]) {
            allExcludedQuestions.push(q.question);
          }
        }
      }

      const difficultyMix =
        input.difficulty === "mixed"
          ? { easy: 30, medium: 50, hard: 20 }
          : {
              easy: input.difficulty === "easy" ? 100 : 0,
              medium: input.difficulty === "medium" ? 100 : 0,
              hard: input.difficulty === "hard" ? 100 : 0,
            };

      const examIds: number[] = [];
      let totalQuestions = 0;

      for (let batch = 0; batch < input.count; batch++) {
        const { systemPrompt, prompt } = buildMCQFromTutorialPrompt({
          examName: exam!.name,
          tutorialTitle: tutorial.title,
          tutorialContentText: plainText.substring(0, 50000),
          count: input.questionsPerExam,
          difficultyMix,
          excludeQuestions: allExcludedQuestions.length > 0 ? allExcludedQuestions : undefined,
        });

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

        const generatedQuestions = result.merged;
        const questionsList = Array.isArray(generatedQuestions)
          ? generatedQuestions
          : ((generatedQuestions as { questions: unknown[] }).questions ?? []);

        const formattedQuestions = parseAIQuestions(questionsList, tutorial.title);

        // Filter out duplicates by hash
        const newQuestions = formattedQuestions.filter((q) => {
          const hash = createHash("md5").update(q.question.toLowerCase().trim()).digest("hex");
          return !allExcludedHashes.has(hash);
        });

        const hashes = newQuestions.map((q) =>
          createHash("md5").update(q.question.toLowerCase().trim()).digest("hex"),
        );

        const diffDist = { easy: 0, medium: 0, hard: 0 };
        for (const q of newQuestions) {
          diffDist[q.difficulty]++;
        }

        const [userExam] = await ctx.db
          .insert(userGeneratedExams)
          .values({
            userId: ctx.userId,
            examId: tutorial.examId,
            syllabusNodeId: tutorial.syllabusNodeId,
            title: `${tutorial.title} — Practice Exam ${existingExams.length + batch + 1}`,
            description: `Auto-generated practice exam #${existingExams.length + batch + 1}`,
            questions: newQuestions,
            questionCount: newQuestions.length,
            difficultyDistribution: diffDist,
            timeLimitMinutes: input.timeLimitMinutes ?? Math.ceil(newQuestions.length * 1.5),
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
            questionHashes: hashes,
            ownerType: "user",
            ownerId: ctx.userId,
          })
          .returning({ id: userGeneratedExams.id });

        examIds.push(userExam!.id);
        totalQuestions += newQuestions.length;

        // Add to exclusion lists for next batch
        for (const h of hashes) allExcludedHashes.add(h);
        for (const q of newQuestions) allExcludedQuestions.push(q.question);
      }

      // Increment quota for each exam generated
      for (let i = 0; i < examIds.length; i++) {
        await incrementExamCount(ctx.db as never, ctx.userId);
      }

      return { examIds, totalQuestions };
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

  // ═══ USER: Start (take) a user-generated exam ═══
  startUserExam: protectedProcedure.input(startUserExamSchema).query(async ({ ctx, input }) => {
    const [exam] = await ctx.db
      .select({
        id: userGeneratedExams.id,
        title: userGeneratedExams.title,
        questions: userGeneratedExams.questions,
        questionCount: userGeneratedExams.questionCount,
        timeLimitMinutes: userGeneratedExams.timeLimitMinutes,
        timesAttempted: userGeneratedExams.timesAttempted,
        bestScore: userGeneratedExams.bestScore,
        userId: userGeneratedExams.userId,
      })
      .from(userGeneratedExams)
      .where(eq(userGeneratedExams.id, input.id))
      .limit(1);

    if (!exam || exam.userId !== ctx.userId) {
      throw new Error("Exam not found or not owned by you");
    }

    // Strip answers and explanations from questions
    const questions = (exam.questions as UserGeneratedQuestion[])
      .filter((q) => q.question && Array.isArray(q.options) && q.options.length >= 2)
      .map((q, i) => ({
        id: `q_${i}`,
        question: q.question,
        options: q.options,
        difficulty: q.difficulty ?? "medium",
        subject: q.subject ?? "General",
        questionNumber: i + 1,
      }));

    return {
      id: exam.id,
      title: exam.title,
      questions,
      questionCount: exam.questionCount,
      timeLimitMinutes: exam.timeLimitMinutes ?? 30,
      timesAttempted: exam.timesAttempted ?? 0,
      bestScore: exam.bestScore ?? 0,
      startedAt: new Date().toISOString(),
    };
  }),

  // ═══ USER: Submit a user-generated exam ═══
  submitUserExam: protectedProcedure
    .input(submitUserExamSchema)
    .mutation(async ({ ctx, input }) => {
      const [exam] = await ctx.db
        .select({
          id: userGeneratedExams.id,
          questions: userGeneratedExams.questions,
          questionCount: userGeneratedExams.questionCount,
          timesAttempted: userGeneratedExams.timesAttempted,
          bestScore: userGeneratedExams.bestScore,
          userId: userGeneratedExams.userId,
        })
        .from(userGeneratedExams)
        .where(eq(userGeneratedExams.id, input.id))
        .limit(1);

      if (!exam || exam.userId !== ctx.userId) {
        throw new Error("Exam not found or not owned by you");
      }

      const questions = (exam.questions as UserGeneratedQuestion[]).filter(
        (q) => q.question && Array.isArray(q.options) && q.options.length >= 2,
      );

      // Score the answers
      let correct = 0;
      let incorrect = 0;
      let unanswered = 0;

      const detailedResults = questions.map((q, i) => {
        const qId = `q_${i}`;
        const userAnswer = input.answers[qId];
        const isCorrect = userAnswer === q.answer;
        const isAnswered = userAnswer !== undefined;

        if (isAnswered && isCorrect) correct++;
        else if (isAnswered) incorrect++;
        else unanswered++;

        return {
          id: qId,
          question: q.question,
          options: q.options,
          correctAnswer: q.answer,
          userAnswer: userAnswer ?? null,
          isCorrect: isAnswered && isCorrect,
          explanation: q.explanation,
          difficulty: q.difficulty,
          subject: q.subject,
        };
      });

      const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;

      // Update exam record
      const currentBest = exam.bestScore ?? 0;
      const newAttempts = (exam.timesAttempted ?? 0) + 1;

      await ctx.db
        .update(userGeneratedExams)
        .set({
          timesAttempted: newAttempts,
          bestScore: score > currentBest ? score : currentBest,
          lastAttemptedAt: new Date(),
          lastAttemptAnswers: input.answers,
          updatedAt: new Date(),
        })
        .where(eq(userGeneratedExams.id, input.id));

      return {
        score,
        correct,
        incorrect,
        unanswered,
        totalQuestions: questions.length,
        timeTakenSeconds: input.timeTakenSeconds,
        questions: detailedResults,
      };
    }),

  // ═══ USER: Get exam results for review ═══
  getUserExamResults: protectedProcedure
    .input(startUserExamSchema)
    .query(async ({ ctx, input }) => {
      const [exam] = await ctx.db
        .select({
          id: userGeneratedExams.id,
          title: userGeneratedExams.title,
          questions: userGeneratedExams.questions,
          questionCount: userGeneratedExams.questionCount,
          timesAttempted: userGeneratedExams.timesAttempted,
          bestScore: userGeneratedExams.bestScore,
          lastAttemptedAt: userGeneratedExams.lastAttemptedAt,
          lastAttemptAnswers: userGeneratedExams.lastAttemptAnswers,
          userId: userGeneratedExams.userId,
        })
        .from(userGeneratedExams)
        .where(eq(userGeneratedExams.id, input.id))
        .limit(1);

      if (!exam || exam.userId !== ctx.userId) {
        throw new Error("Exam not found or not owned by you");
      }

      if (!exam.timesAttempted || exam.timesAttempted === 0) {
        throw new Error("No attempts yet — take the exam first");
      }

      const questions = exam.questions as UserGeneratedQuestion[];
      const answers = (exam.lastAttemptAnswers ?? {}) as Record<string, number>;

      const detailedResults = questions.map((q, i) => {
        const qId = `q_${i}`;
        const userAnswer = answers[qId];
        return {
          id: qId,
          question: q.question,
          options: q.options,
          correctAnswer: q.answer,
          userAnswer: userAnswer ?? null,
          isCorrect: userAnswer === q.answer,
          explanation: q.explanation,
          difficulty: q.difficulty,
          subject: q.subject,
        };
      });

      return {
        id: exam.id,
        title: exam.title,
        questionCount: exam.questionCount,
        timesAttempted: exam.timesAttempted,
        bestScore: exam.bestScore,
        lastAttemptedAt: exam.lastAttemptedAt,
        questions: detailedResults,
      };
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

  // ═══ USER: Generate exam from saved notes ═══
  generateExamFromNotes: protectedProcedure
    .input(generateExamFromNotesSchema)
    .mutation(async ({ ctx, input }): Promise<{ examId: number; questionCount: number }> => {
      // 0. Check subscription quota
      const quota = await checkExamQuota(ctx.db as never, ctx.userId);
      if (!quota.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Exam generation limit reached (${quota.used}/${quota.limit} on ${quota.planName} plan). Upgrade to generate more exams.`,
        });
      }

      // 1. Load selected notes (only user's own notes)
      const noteRows = await ctx.db
        .select({
          id: topicNotes.id,
          noteContent: topicNotes.noteContent,
          keyword: topicNotes.keyword,
          syllabusId: topicNotes.syllabusId,
          syllabusNodeId: topicNotes.syllabusNodeId,
        })
        .from(topicNotes)
        .where(
          and(
            eq(topicNotes.userId, ctx.userId),
            sql`${topicNotes.id} IN (${sql.join(
              input.noteIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        );

      if (noteRows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No notes found. They may have been deleted.",
        });
      }

      // 2. Derive exam from first note's syllabus
      const [syllabus] = await ctx.db
        .select({ examId: syllabi.examId })
        .from(syllabi)
        .where(eq(syllabi.id, noteRows[0]!.syllabusId))
        .limit(1);

      const examId = syllabus?.examId;
      if (!examId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Could not determine exam for these notes.",
        });
      }

      // Get exam name
      let examName = "General";
      const [exam] = await ctx.db
        .select({ name: exams.name })
        .from(exams)
        .where(eq(exams.id, examId))
        .limit(1);
      if (exam) examName = exam.name;

      // 3. Concatenate note contents (cap at 50KB)
      const concatenated = noteRows
        .map((n) => {
          const header = n.keyword ? `Question: ${n.keyword}\n\n` : "";
          return header + n.noteContent;
        })
        .join("\n\n---\n\n")
        .substring(0, 50000);

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
        examName,
        tutorialTitle: `Notes Collection (${noteRows.length} notes)`,
        tutorialContentText: concatenated,
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
          examId,
        },
        ctx.db,
      );

      // 6. Parse questions
      const generatedQuestions = result.merged;
      const questionsList = Array.isArray(generatedQuestions)
        ? generatedQuestions
        : ((generatedQuestions as { questions: unknown[] }).questions ?? []);

      const formattedQuestions = parseAIQuestions(questionsList, "Notes");

      if (formattedQuestions.length === 0) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI returned no valid questions. Please try again.",
        });
      }

      // Count difficulties
      const diffDist = { easy: 0, medium: 0, hard: 0 };
      for (const q of formattedQuestions) {
        diffDist[q.difficulty]++;
      }

      // 7. Save to user_generated_exams
      const sourceNodeIds = [...new Set(noteRows.map((n) => n.syllabusNodeId))];
      const [userExam] = await ctx.db
        .insert(userGeneratedExams)
        .values({
          userId: ctx.userId,
          examId,
          syllabusNodeId: noteRows[0]!.syllabusNodeId,
          title: `Exam from ${noteRows.length} Note${noteRows.length > 1 ? "s" : ""} — ${examName}`,
          description: `Auto-generated practice exam from ${noteRows.length} saved notes`,
          questions: formattedQuestions,
          questionCount: formattedQuestions.length,
          difficultyDistribution: diffDist,
          timeLimitMinutes: Math.ceil(formattedQuestions.length * 1.5),
          aiProvider: result.mergeMetadata.providersUsed[0] ?? "claude",
          aiTokensUsed: result.mergeMetadata.providersUsed.reduce(
            (acc, p) =>
              acc +
              (result.perProvider[p]?.tokensUsed.input ?? 0) +
              (result.perProvider[p]?.tokensUsed.output ?? 0),
            0,
          ),
          aiCostUsd: result.mergeMetadata.totalCostUsd,
          sourceNodeIds,
          ownerType: "user",
          ownerId: ctx.userId,
        })
        .returning({ id: userGeneratedExams.id });

      // Increment quota counter
      await incrementExamCount(ctx.db as never, ctx.userId);

      return {
        examId: userExam!.id,
        questionCount: formattedQuestions.length,
      };
    }),
});
