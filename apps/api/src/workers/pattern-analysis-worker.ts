import { Worker, Job } from "bullmq";
import { eq, and, sql } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import {
  questions,
  examPatterns,
  paperAnalysis,
  exams,
  portalDocuments,
} from "@examforge/shared/db/schema";
import {
  classifiedQuestionsResponseSchema,
  examFingerprintSchema,
} from "@examforge/shared/validators";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import {
  PATTERN_ANALYSIS_QUEUE_NAME,
  type PatternAnalysisJobData,
} from "../queues/pattern-analysis-queue.js";
import { routeAIRequest, routeEmbedRequest } from "../ai/ai-router.js";
import { buildQuestionClassifierPrompt } from "../ai/prompts/question-classifier.js";
import { buildPatternAnalyzerPrompt } from "../ai/prompts/pattern-analyzer.js";

// ─── Worker Factory ───

export function createPatternAnalysisWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    PATTERN_ANALYSIS_QUEUE_NAME,
    async (job: Job) => {
      const data = job.data as PatternAnalysisJobData;

      if (data.type === "classify-paper") {
        return classifyPaper(job, data, db);
      } else if (data.type === "analyze-pattern") {
        return analyzePattern(job, data, db);
      } else {
        throw new Error(`Unknown job type: ${data.type}`);
      }
    },
    {
      connection: getBullMQConnection(),
      concurrency: 2,
      limiter: {
        max: 3,
        duration: 60_000, // Max 3 classification jobs per minute
      },
    },
  );

  worker.on("completed", (job) => {
    console.log(`[pattern-analysis] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[pattern-analysis] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// ─── Classify Paper Job ───

async function classifyPaper(
  job: Job,
  data: PatternAnalysisJobData,
  db: ReturnType<typeof createDatabase>,
): Promise<{ success: boolean; questionsClassified: number }> {
  console.log(`[pattern-analysis] Classifying paper for exam ${data.examId}`);

  // Load questions for this paper
  const conditions = [eq(questions.examId, data.examId)];
  if (data.portalDocumentId) {
    conditions.push(eq(questions.portalDocumentId, data.portalDocumentId));
  } else if (data.paperYear) {
    conditions.push(eq(questions.paperYear, data.paperYear));
  }

  const questionRows = await db
    .select()
    .from(questions)
    .where(and(...conditions));

  if (questionRows.length === 0) {
    console.log(`[pattern-analysis] No questions found for classification`);
    return { success: true, questionsClassified: 0 };
  }

  // Get exam context
  const [exam] = await db.select().from(exams).where(eq(exams.id, data.examId)).limit(1);

  if (!exam) {
    throw new Error(`Exam ${data.examId} not found`);
  }

  // Determine paper year from questions or portal document
  let paperYear = data.paperYear;
  let paperNumber: string | undefined;
  let source: string | undefined;

  if (data.portalDocumentId) {
    const [doc] = await db
      .select()
      .from(portalDocuments)
      .where(eq(portalDocuments.id, data.portalDocumentId))
      .limit(1);
    if (doc) {
      paperYear = doc.examYear ?? paperYear;
      source = doc.portalName;
    }
  }

  if (!paperYear && questionRows[0]?.paperYear) {
    paperYear = questionRows[0].paperYear;
  }
  if (questionRows[0]?.paperNumber) {
    paperNumber = questionRows[0].paperNumber;
  }

  // Create or find paper_analysis row
  const existingAnalysis = data.portalDocumentId
    ? await db
        .select()
        .from(paperAnalysis)
        .where(
          and(
            eq(paperAnalysis.examId, data.examId),
            eq(paperAnalysis.portalDocumentId, data.portalDocumentId),
          ),
        )
        .limit(1)
    : [];

  let analysisId: string;
  if (existingAnalysis.length > 0) {
    analysisId = existingAnalysis[0]!.id;
    await db
      .update(paperAnalysis)
      .set({ status: "classifying", updatedAt: new Date() })
      .where(eq(paperAnalysis.id, analysisId));
  } else {
    const [inserted] = await db
      .insert(paperAnalysis)
      .values({
        examId: data.examId,
        year: paperYear ?? new Date().getFullYear(),
        paperNumber: paperNumber ?? undefined,
        source,
        portalDocumentId: data.portalDocumentId ?? undefined,
        totalQuestions: questionRows.length,
        subjectDistribution: {},
        topicDistribution: {},
        difficultyDistribution: {},
        styleDistribution: {},
        analysisJson: {},
        status: "classifying",
        orgId: data.orgId,
      })
      .returning({ id: paperAnalysis.id });
    analysisId = inserted!.id;
  }

  await job.updateProgress({ stage: "classifying", percent: 10 });

  // Batch questions into groups of 20 for classification
  const BATCH_SIZE = 20;
  const batches: (typeof questionRows)[] = [];
  for (let i = 0; i < questionRows.length; i += BATCH_SIZE) {
    batches.push(questionRows.slice(i, i + BATCH_SIZE));
  }

  let totalClassified = 0;
  const subjectCounts: Record<string, number> = {};
  const topicCounts: Record<string, number> = {};
  const difficultyCounts: Record<string, number> = {};
  const styleCounts: Record<string, number> = {};

  try {
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx]!;

      const questionsForAI = batch.map((q) => {
        const content = q.content as { question?: string; options?: string[]; answer?: number };
        return {
          questionId: q.id,
          questionNumber: q.questionNumber ?? undefined,
          question: content.question ?? "",
          options: content.options ?? [],
          answer: content.answer,
          subject: q.subject,
          topic: q.topic ?? undefined,
        };
      });

      const { systemPrompt, prompt } = buildQuestionClassifierPrompt(questionsForAI, {
        examName: exam.name,
        conductingBody: exam.conductingBody ?? "Unknown",
        year: paperYear ?? new Date().getFullYear(),
        paperNumber,
      });

      const result = await routeAIRequest(
        {
          task: "classify_questions",
          prompt,
          systemPrompt,
          schema: classifiedQuestionsResponseSchema,
          userId: data.userId,
          examId: data.examId,
        },
        db,
      );

      // Update each question with classification results
      for (const classified of result.data.questions) {
        const matchingQ = batch.find((q) => q.id === classified.questionId);
        if (!matchingQ) continue;

        await db
          .update(questions)
          .set({
            analyzedSubject: classified.analyzedSubject,
            analyzedTopic: classified.analyzedTopic,
            analyzedSubtopic: classified.analyzedSubtopic ?? null,
            analyzedStyle: classified.analyzedStyle,
            patternTags: classified.patternTags,
            updatedAt: new Date(),
          })
          .where(eq(questions.id, classified.questionId));

        // Aggregate counts
        subjectCounts[classified.analyzedSubject] =
          (subjectCounts[classified.analyzedSubject] ?? 0) + 1;
        topicCounts[`${classified.analyzedSubject} > ${classified.analyzedTopic}`] =
          (topicCounts[`${classified.analyzedSubject} > ${classified.analyzedTopic}`] ?? 0) + 1;
        difficultyCounts[classified.difficulty] =
          (difficultyCounts[classified.difficulty] ?? 0) + 1;
        styleCounts[classified.analyzedStyle] = (styleCounts[classified.analyzedStyle] ?? 0) + 1;

        totalClassified++;
      }

      const percent = 10 + Math.round(((batchIdx + 1) / batches.length) * 70);
      await job.updateProgress({ stage: "classifying", percent, batchesComplete: batchIdx + 1 });
    }

    // Repeat detection using pgvector embeddings
    await job.updateProgress({ stage: "repeat_detection", percent: 80 });

    // First ensure all questions have embeddings
    const questionsWithoutEmbeddings = questionRows.filter((q) => !q.embedding);
    if (questionsWithoutEmbeddings.length > 0) {
      const texts = questionsWithoutEmbeddings.map((q) => {
        const content = q.content as { question?: string; options?: string[] };
        return `${content.question ?? ""} ${(content.options ?? []).join(" ")}`;
      });

      // Batch embed in groups of 100
      const EMBED_BATCH = 100;
      for (let i = 0; i < texts.length; i += EMBED_BATCH) {
        const batchTexts = texts.slice(i, i + EMBED_BATCH);
        const batchQs = questionsWithoutEmbeddings.slice(i, i + EMBED_BATCH);

        const embedResult = await routeEmbedRequest(
          {
            task: "embed_text",
            texts: batchTexts,
            userId: data.userId,
            examId: data.examId,
          },
          db,
        );

        for (let j = 0; j < batchQs.length; j++) {
          const q = batchQs[j]!;
          const embedding = embedResult.embeddings[j];
          if (embedding) {
            await db
              .update(questions)
              .set({ embedding, updatedAt: new Date() })
              .where(eq(questions.id, q.id));
          }
        }
      }
    }

    // Find repeats: questions from other years with high cosine similarity
    let repeatedCount = 0;
    for (const q of questionRows) {
      const similarResults = await db.execute(sql`
        SELECT q2.id, q2.paper_year, q2.paper_number, q2.question_number,
               1 - (q1.embedding <=> q2.embedding) as similarity
        FROM questions q1, questions q2
        WHERE q1.id = ${q.id}
          AND q2.exam_id = ${data.examId}
          AND q2.id != q1.id
          AND q2.paper_year IS NOT NULL
          AND q1.embedding IS NOT NULL
          AND q2.embedding IS NOT NULL
          AND q1.paper_year != q2.paper_year
          AND 1 - (q1.embedding <=> q2.embedding) > 0.88
        ORDER BY similarity DESC
        LIMIT 5
      `);

      const rows = similarResults.rows as Array<{
        id: string;
        paper_year: number;
        paper_number: string | null;
        question_number: number | null;
        similarity: number;
      }>;

      if (rows.length > 0) {
        const repeatedFrom = rows.map((r) => ({
          year: r.paper_year,
          paperNumber: r.paper_number ?? undefined,
          questionNumber: r.question_number ?? undefined,
        }));

        await db
          .update(questions)
          .set({
            isRepeated: true,
            repeatedFrom,
            updatedAt: new Date(),
          })
          .where(eq(questions.id, q.id));

        repeatedCount++;
      }
    }

    // Update paper_analysis with aggregated distributions
    await db
      .update(paperAnalysis)
      .set({
        totalQuestions: questionRows.length,
        questionsWithAnswers: questionRows.filter(
          (q) => (q.content as { answer?: number }).answer !== undefined,
        ).length,
        subjectDistribution: subjectCounts,
        topicDistribution: topicCounts,
        difficultyDistribution: difficultyCounts,
        styleDistribution: styleCounts,
        repeatedQuestions: repeatedCount,
        analysisJson: { subjectCounts, topicCounts, difficultyCounts, styleCounts, repeatedCount },
        status: "classified",
        updatedAt: new Date(),
      })
      .where(eq(paperAnalysis.id, analysisId));

    await job.updateProgress({ stage: "completed", percent: 100 });

    console.log(
      `[pattern-analysis] Classified ${totalClassified}/${questionRows.length} questions, ${repeatedCount} repeats detected`,
    );

    return { success: true, questionsClassified: totalClassified };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pattern-analysis] Classification failed:`, msg);

    await db
      .update(paperAnalysis)
      .set({ status: "error", errorMessage: msg, updatedAt: new Date() })
      .where(eq(paperAnalysis.id, analysisId));

    throw err;
  }
}

// ─── Analyze Pattern Job ───

async function analyzePattern(
  job: Job,
  data: PatternAnalysisJobData,
  db: ReturnType<typeof createDatabase>,
): Promise<{ success: boolean; patternsFound: boolean }> {
  console.log(`[pattern-analysis] Analyzing patterns for exam ${data.examId}`);

  // Load all classified paper analyses
  const papers = await db
    .select()
    .from(paperAnalysis)
    .where(and(eq(paperAnalysis.examId, data.examId), eq(paperAnalysis.status, "classified")));

  if (papers.length < 2) {
    console.log(
      `[pattern-analysis] Need at least 2 classified papers for pattern analysis, found ${papers.length}`,
    );
    return { success: true, patternsFound: false };
  }

  // Get exam context
  const [exam] = await db.select().from(exams).where(eq(exams.id, data.examId)).limit(1);

  if (!exam) {
    throw new Error(`Exam ${data.examId} not found`);
  }

  await job.updateProgress({ stage: "analyzing", percent: 20 });

  const papersForAnalysis = papers.map((p) => ({
    year: p.year,
    paperNumber: p.paperNumber ?? undefined,
    totalQuestions: p.totalQuestions,
    subjectDistribution: p.subjectDistribution as Record<string, number>,
    topicDistribution: p.topicDistribution as Record<string, number>,
    difficultyDistribution: p.difficultyDistribution as Record<string, number>,
    styleDistribution: p.styleDistribution as Record<string, number>,
    repeatedQuestions: p.repeatedQuestions ?? 0,
  }));

  const { systemPrompt, prompt } = buildPatternAnalyzerPrompt(papersForAnalysis, {
    examId: data.examId,
    examName: exam.name,
    conductingBody: exam.conductingBody ?? "Unknown",
    totalMarks: exam.totalMarks ?? undefined,
    durationMinutes: exam.durationMinutes ?? undefined,
    negativeMarking: exam.negativeMarking ?? undefined,
    negativeMarkingScheme: exam.negativeMarkingScheme ?? undefined,
  });

  const result = await routeAIRequest(
    {
      task: "analyze_exam_pattern",
      prompt,
      systemPrompt,
      schema: examFingerprintSchema,
      userId: data.userId,
      examId: data.examId,
    },
    db,
  );

  await job.updateProgress({ stage: "saving", percent: 80 });

  // Deactivate any existing current pattern
  await db
    .update(examPatterns)
    .set({ isCurrent: false, updatedAt: new Date() })
    .where(and(eq(examPatterns.examId, data.examId), eq(examPatterns.isCurrent, true)));

  // Get the next version number
  const existingPatterns = await db
    .select({ version: examPatterns.version })
    .from(examPatterns)
    .where(eq(examPatterns.examId, data.examId))
    .orderBy(sql`version DESC`)
    .limit(1);

  const nextVersion = (existingPatterns[0]?.version ?? 0) + 1;

  const fingerprint = result.data;

  // Insert new pattern
  await db.insert(examPatterns).values({
    examId: data.examId,
    fingerprint,
    papersAnalyzed: papers.length,
    paperYears: papers.map((p) => p.year).sort(),
    confidence: fingerprint.confidence,
    totalQuestions: fingerprint.structure.totalQuestions,
    totalMarks: fingerprint.structure.totalMarks,
    durationMinutes: fingerprint.structure.durationMinutes,
    negativeMarking: fingerprint.structure.negativeMarking,
    subjectWeightage: fingerprint.subjectWeightage,
    difficultyDistribution: fingerprint.difficultyDistribution,
    topTopics: fingerprint.topicFrequency
      .filter((t) => t.importance === "must_study" || t.importance === "high")
      .slice(0, 20),
    aiProvider: result.provider,
    aiTokensUsed: result.usage.totalTokens,
    aiCostUsd: result.estimatedCostUsd,
    version: nextVersion,
    isCurrent: true,
    status: "active",
    createdBy: data.userId,
    orgId: data.orgId,
  });

  // Link paper analyses to this pattern
  const [newPattern] = await db
    .select({ id: examPatterns.id })
    .from(examPatterns)
    .where(and(eq(examPatterns.examId, data.examId), eq(examPatterns.isCurrent, true)))
    .limit(1);

  if (newPattern) {
    for (const paper of papers) {
      await db
        .update(paperAnalysis)
        .set({ examPatternId: newPattern.id, updatedAt: new Date() })
        .where(eq(paperAnalysis.id, paper.id));
    }
  }

  await job.updateProgress({ stage: "completed", percent: 100 });

  console.log(
    `[pattern-analysis] Pattern analysis complete for exam ${data.examId}: ${papers.length} papers, version ${nextVersion}`,
  );

  return { success: true, patternsFound: true };
}
