import { Worker, Job } from "bullmq";
import { eq, and, sql } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import type { Database } from "@examforge/shared/db";
import {
  syllabi,
  syllabusNodes,
  exams,
  tutorialFiles,
  tutorialGenerationJobs,
} from "@examforge/shared/db/schema";
import type { TutorialAgentJobData } from "@examforge/shared/validators";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import { routeTextRequest } from "../ai/ai-router.js";
import {
  buildTutorialHtmlSystemPrompt,
  buildTutorialHtmlUserPrompt,
  getExamTextbooks,
} from "../ai/prompts/tutorial-html-prompt.js";
import {
  assembleTutorial,
  assemblePreview,
  validateHtmlFragment,
  extractMetadataFromFragment,
} from "../services/tutorial-html-generator.js";
import { parseHtmlToSections } from "../services/tutorial-html-parser.js";
import { getTutorialStorage } from "../services/tutorial-storage.js";
import { TUTORIAL_AGENT_QUEUE_NAME } from "../queues/tutorial-agent-queue.js";
import type { AIProviderId } from "../ai/types.js";
import { PROVIDER_ID_TO_AI_PROVIDER } from "../ai/types.js";

// ─── Worker Factory ───

export function createTutorialAgentWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    TUTORIAL_AGENT_QUEUE_NAME,
    async (job: Job) => {
      const data = job.data as TutorialAgentJobData;
      return processTutorialAgentJob(job, data, db);
    },
    {
      connection: getBullMQConnection(),
      concurrency: 1, // Process one syllabus at a time
    },
  );

  worker.on("completed", (job) => {
    console.log(`[tutorial-agent] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[tutorial-agent] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// ─── Types ───

type TutorialAgentResult = {
  totalGenerated: number;
  totalFailed: number;
  totalTokens: number;
  totalCostUsd: number;
};

// ─── Main Job Processor ───

async function processTutorialAgentJob(
  job: Job,
  jobData: TutorialAgentJobData,
  db: Database,
): Promise<TutorialAgentResult> {
  const { jobId, syllabusId, examId, userId, providers, retryFailedOnly } = jobData;

  try {
    // 1. Update job status → running
    await db
      .update(tutorialGenerationJobs)
      .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(tutorialGenerationJobs.id, jobId));

    // 2. Load exam info
    const [exam] = await db
      .select({ name: exams.name, conductingBody: exams.conductingBody })
      .from(exams)
      .where(eq(exams.id, examId))
      .limit(1);

    if (!exam) {
      throw new Error(`Exam ${examId} not found`);
    }

    // 3. Load syllabus info
    const [syllabus] = await db
      .select({ rawText: syllabi.rawText })
      .from(syllabi)
      .where(eq(syllabi.id, syllabusId))
      .limit(1);

    // 4. Load all leaf nodes (topics, subtopics — things that get tutorials)
    const allNodes = await db
      .select({
        id: syllabusNodes.id,
        syllabusId: syllabusNodes.syllabusId,
        parentId: syllabusNodes.parentId,
        nodeType: syllabusNodes.nodeType,
        title: syllabusNodes.title,
        description: syllabusNodes.description,
        content: syllabusNodes.content,
        depth: syllabusNodes.depth,
        sortOrder: syllabusNodes.sortOrder,
        keyTerms: syllabusNodes.keyTerms,
      })
      .from(syllabusNodes)
      .where(eq(syllabusNodes.syllabusId, syllabusId))
      .orderBy(syllabusNodes.depth, syllabusNodes.sortOrder);

    // Find leaf nodes (nodes that have no children)
    const parentIds = new Set(allNodes.filter((n) => n.parentId !== null).map((n) => n.parentId!));
    let leafNodes = allNodes.filter((n) => !parentIds.has(n.id) && n.nodeType !== "unit");

    // If retrying failed only, filter to nodes that don't have a current tutorial
    if (retryFailedOnly) {
      const existingTutorials = await db
        .select({ syllabusNodeId: tutorialFiles.syllabusNodeId })
        .from(tutorialFiles)
        .where(and(eq(tutorialFiles.syllabusId, syllabusId), eq(tutorialFiles.isCurrent, true)));

      const generatedNodeIds = new Set(existingTutorials.map((t) => t.syllabusNodeId));
      leafNodes = leafNodes.filter((n) => !generatedNodeIds.has(n.id));

      console.log(
        `[tutorial-agent] Retry mode: ${leafNodes.length} failed nodes to process (${generatedNodeIds.size} already generated)`,
      );
    }

    let totalGenerated = 0;
    let totalFailed = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;

    const storage = getTutorialStorage();
    const textbookList = getExamTextbooks(exam.name);
    const systemPrompt = buildTutorialHtmlSystemPrompt();

    // 5. Process each leaf node
    for (let i = 0; i < leafNodes.length; i++) {
      const node = leafNodes[i]!;

      // Check if job is paused
      const [currentJob] = await db
        .select({ status: tutorialGenerationJobs.status })
        .from(tutorialGenerationJobs)
        .where(eq(tutorialGenerationJobs.id, jobId))
        .limit(1);

      if (currentJob?.status === "paused") {
        console.log(`[tutorial-agent] Job ${jobId} paused. Stopping.`);
        break;
      }

      // Update current node
      await db
        .update(tutorialGenerationJobs)
        .set({
          currentNodeId: node.id,
          currentNodeTitle: node.title,
          updatedAt: new Date(),
        })
        .where(eq(tutorialGenerationJobs.id, jobId));

      try {
        // Get parent title for context
        const parentNode = node.parentId ? allNodes.find((n) => n.id === node.parentId) : null;

        // Get prev/next nodes for continuity
        const prevNode = i > 0 ? leafNodes[i - 1]! : null;
        const nextNode = i < leafNodes.length - 1 ? leafNodes[i + 1]! : null;

        // Extract relevant section of raw text
        const rawTextSection = extractRelevantText(syllabus?.rawText ?? "", node.title);

        // Build prompt
        const prompt = buildTutorialHtmlUserPrompt({
          examName: exam.name,
          conductingBody: exam.conductingBody ?? exam.name,
          unitTitle: parentNode?.title ?? "General",
          topicTitle: node.title,
          nodeDescription: node.description ?? "",
          keyTerms: (node.keyTerms as string[]) ?? [],
          difficulty: "Medium",
          prevTopic: prevNode?.title ?? "",
          nextTopic: nextNode?.title ?? "",
          rawTextSection,
          textbookList,
        });

        // Use the first provider in the list
        const providerId = (providers[0] ?? "claude") as AIProviderId;
        const aiProvider = PROVIDER_ID_TO_AI_PROVIDER[providerId];

        // Call AI for HTML fragment
        const result = await routeTextRequest(
          {
            task: "generate_tutorial_html",
            prompt,
            systemPrompt,
            userId,
            examId,
            overrideProvider: aiProvider,
            maxTokens: 8192,
          },
          db,
        );

        const fragment = result.data;

        // Validate fragment
        const validation = validateHtmlFragment(fragment);
        if (!validation.valid) {
          console.warn(
            `[tutorial-agent] Fragment validation warnings for "${node.title}":`,
            validation.errors,
          );
          // Continue anyway — partial content is better than none
        }

        // Extract metadata
        const metadata = extractMetadataFromFragment(fragment);

        // Build file key
        const unitSlug = parentNode ? slugify(parentNode.title) : "general";
        const topicSlug = slugify(node.title);
        const fileKey = `${examId}/${syllabusId}/${unitSlug}/${topicSlug}.html`;
        const previewFileKey = `${examId}/${syllabusId}/${unitSlug}/${topicSlug}-preview.html`;

        // Assemble full HTML
        const fullHtml = assembleTutorial({
          fragment,
          title: node.title,
          subject: exam.name,
          unitName: parentNode?.title ?? "General",
          topicName: node.title,
          estimatedTime: metadata.estimatedReadMinutes,
          difficulty: "Medium",
          progressPercent: Math.round(((i + 1) / leafNodes.length) * 100),
          prevTopicUrl: prevNode ? `/dashboard/tutorial/${prevNode.id}` : "#",
          nextTopicUrl: nextNode ? `/dashboard/tutorial/${nextNode.id}` : "#",
        });

        // Parse HTML into sections for reader
        const parsed = parseHtmlToSections(fullHtml);

        // Upload full HTML
        await storage.upload(fileKey, fullHtml);

        // Generate and upload preview
        let previewUrl: string | undefined;
        if (jobData.generatePreviews) {
          const previewHtml = assemblePreview({
            fullHtml,
            previewPercentage: jobData.previewPercentage,
          });
          await storage.upload(previewFileKey, previewHtml);
          previewUrl = storage.getUrl(previewFileKey);
        }

        // Determine version
        const [existing] = await db
          .select({
            maxVersion: sql<number>`COALESCE(MAX(${tutorialFiles.version}), 0)`,
          })
          .from(tutorialFiles)
          .where(eq(tutorialFiles.syllabusNodeId, node.id));

        const nextVersion = (existing?.maxVersion ?? 0) + 1;

        // Mark old versions as not current
        if (nextVersion > 1) {
          await db
            .update(tutorialFiles)
            .set({ isCurrent: false, updatedAt: new Date() })
            .where(
              and(eq(tutorialFiles.syllabusNodeId, node.id), eq(tutorialFiles.isCurrent, true)),
            );
        }

        // Insert tutorial_files record
        await db.insert(tutorialFiles).values({
          syllabusNodeId: node.id,
          syllabusId,
          examId,
          fileKey,
          fileUrl: storage.getUrl(fileKey),
          previewFileKey: jobData.generatePreviews ? previewFileKey : undefined,
          previewFileUrl: previewUrl,
          fileSizeBytes: Buffer.byteLength(fullHtml, "utf-8"),
          sections: parsed.sections,
          plainText: parsed.plainText,
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
          generatedBy: "agent",
          aiProvidersUsed: [providerId],
          aiTokensUsed: result.usage.totalTokens,
          aiCostUsd: result.estimatedCostUsd,
          generationConfig: {
            jobId,
            providers,
            model: result.model,
          },
          ownerType: "platform",
          visibility: "public",
        });

        // Update node status
        await db
          .update(syllabusNodes)
          .set({ tutorialStatus: "generated", updatedAt: new Date() })
          .where(eq(syllabusNodes.id, node.id));

        totalGenerated++;
        totalTokens += result.usage.totalTokens;
        totalCostUsd += result.estimatedCostUsd;

        // Update job progress
        await db
          .update(tutorialGenerationJobs)
          .set({
            completedNodes: sql`${tutorialGenerationJobs.completedNodes} + 1`,
            totalTokens: sql`${tutorialGenerationJobs.totalTokens} + ${result.usage.totalTokens}`,
            totalCostUsd: sql`${tutorialGenerationJobs.totalCostUsd} + ${result.estimatedCostUsd}`,
            updatedAt: new Date(),
          })
          .where(eq(tutorialGenerationJobs.id, jobId));

        await job.updateProgress(Math.round(((i + 1) / leafNodes.length) * 100));

        console.log(
          `[tutorial-agent] Generated tutorial for "${node.title}" (${i + 1}/${leafNodes.length})`,
        );
      } catch (nodeError) {
        totalFailed++;
        const errorMessage = nodeError instanceof Error ? nodeError.message : String(nodeError);

        console.error(
          `[tutorial-agent] Failed to generate tutorial for "${node.title}":`,
          errorMessage,
        );

        // Update node status
        await db
          .update(syllabusNodes)
          .set({ tutorialStatus: "error", updatedAt: new Date() })
          .where(eq(syllabusNodes.id, node.id));

        // Log error to job
        await db
          .update(tutorialGenerationJobs)
          .set({
            failedNodes: sql`${tutorialGenerationJobs.failedNodes} + 1`,
            errorLog: sql`${tutorialGenerationJobs.errorLog} || ${JSON.stringify([
              {
                nodeId: node.id,
                error: errorMessage,
                timestamp: new Date().toISOString(),
              },
            ])}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(tutorialGenerationJobs.id, jobId));

        // Continue with next node
      }
    }

    // 6. Mark job as completed
    await db
      .update(tutorialGenerationJobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tutorialGenerationJobs.id, jobId));

    return { totalGenerated, totalFailed, totalTokens, totalCostUsd };
  } catch (error) {
    // Fatal error — mark job as failed
    const errorMessage = error instanceof Error ? error.message : String(error);
    await db
      .update(tutorialGenerationJobs)
      .set({
        status: "error",
        errorLog: sql`${tutorialGenerationJobs.errorLog} || ${JSON.stringify([
          {
            nodeId: 0,
            error: `Fatal: ${errorMessage}`,
            timestamp: new Date().toISOString(),
          },
        ])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(tutorialGenerationJobs.id, jobId));

    throw error;
  }
}

// ─── Helpers ───

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 60);
}

function extractRelevantText(rawText: string, topicTitle: string): string {
  if (!rawText) return "";

  // Try to find the topic title in the raw text and extract surrounding context
  const lowerRaw = rawText.toLowerCase();
  const lowerTitle = topicTitle.toLowerCase();
  const index = lowerRaw.indexOf(lowerTitle);

  if (index === -1) {
    // Topic not found in raw text — return empty
    return "";
  }

  // Extract ~2000 chars around the match
  const start = Math.max(0, index - 500);
  const end = Math.min(rawText.length, index + lowerTitle.length + 1500);
  return rawText.substring(start, end).trim();
}
