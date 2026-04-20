/**
 * Topic-Seeded Generation Worker
 *
 * Implements §4.3 of docs/features/QUESTION_ACQUISITION_STRATEGY.md.
 *
 * For one syllabus node:
 *   1. Loads real seed questions mapped to that node
 *   2. Rejects the job if fewer than 3 seeds (strategy doc rule)
 *   3. Analyzes seeds — extracts styles, difficulty distribution,
 *      covered aspects (from prior generations)
 *   4. Calls the `generate_topic_seeded` AI task with seeds + analysis
 *   5. Inserts each generated question with sourceType='topic_ai' +
 *      sourceDetail.seedQuestionIds + mappedSyllabusNodeId set
 *   6. Queues a verify-question job for each so the pipeline grades
 *      the fresh AI questions before they're exposed to users
 *
 * Non-fatal: one AI call — if it fails, the job fails with attempts=2.
 */

import { Worker, Job } from "bullmq";
import { eq, or, and } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import { questions, exams, syllabusNodes } from "@examforge/shared/db/schema";
import { topicSeededGenerationResponseSchema } from "@examforge/shared/validators";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import {
  TOPIC_GENERATION_QUEUE_NAME,
  type TopicGenerationJobData,
} from "../queues/topic-generation-queue.js";
import { routeAIRequest } from "../ai/ai-router.js";
import {
  buildTopicSeededGeneratorPrompt,
  type SeedQuestion,
} from "../ai/prompts/topic-seeded-generator.js";
import { addVerifyQuestionJob } from "../queues/verification-queue.js";

const MIN_SEEDS = 3;

const DEFAULT_PHARMACY_TEXTBOOKS = [
  "KD Tripathi — Essentials of Medical Pharmacology",
  "Rang & Dale — Pharmacology",
  "Remington — The Science and Practice of Pharmacy",
  "Lachman — Theory and Practice of Industrial Pharmacy",
  "Indian Pharmacopoeia (current edition)",
  "Goodman & Gilman — Pharmacological Basis of Therapeutics",
];

// ─── Worker Factory ────────────────────────────────────

export function createTopicGenerationWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    TOPIC_GENERATION_QUEUE_NAME,
    async (job: Job) => {
      const data = job.data as TopicGenerationJobData;
      return generateForNode(job, data, db);
    },
    {
      connection: getBullMQConnection(),
      concurrency: 1, // one topic at a time — each is 1 large LLM call
      limiter: { max: 4, duration: 60_000 },
    },
  );

  worker.on("completed", (job) => {
    console.log(`[topic-gen] Job ${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[topic-gen] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// ─── Orchestrator ──────────────────────────────────────

async function generateForNode(
  job: Job,
  data: TopicGenerationJobData,
  db: ReturnType<typeof createDatabase>,
): Promise<{
  success: boolean;
  questionsGenerated: number;
  questionsQueuedForVerification: number;
  seedsUsed: number;
}> {
  console.log(
    `[topic-gen] Starting for exam=${data.examId} node=${data.syllabusNodeId} count=${data.count}`,
  );

  // 1. Load the node + unit parent
  const [node] = await db
    .select({
      id: syllabusNodes.id,
      title: syllabusNodes.title,
      description: syllabusNodes.description,
      parentId: syllabusNodes.parentId,
      depth: syllabusNodes.depth,
    })
    .from(syllabusNodes)
    .where(eq(syllabusNodes.id, data.syllabusNodeId))
    .limit(1);
  if (!node) throw new Error(`Syllabus node ${data.syllabusNodeId} not found`);

  let unitName: string | undefined;
  if (node.parentId) {
    const [parent] = await db
      .select({ title: syllabusNodes.title, depth: syllabusNodes.depth })
      .from(syllabusNodes)
      .where(eq(syllabusNodes.id, node.parentId))
      .limit(1);
    // Use the closest ancestor at depth 1 (unit) as unitName
    unitName = parent?.title;
  }

  // 2. Load exam context
  const [exam] = await db
    .select({ id: exams.id, name: exams.name, level: exams.level })
    .from(exams)
    .where(eq(exams.id, data.examId))
    .limit(1);
  if (!exam) throw new Error(`Exam ${data.examId} not found`);

  // 3. Load seed questions — real papers + earlier textbook extractions
  //    mapped to this node. Match via syllabusNodeId (direct link from
  //    generation) OR mappedSyllabusNodeId (Layer 3 verification result).
  await job.updateProgress({ stage: "seeds", percent: 15 });

  const seedRows = await db
    .select()
    .from(questions)
    .where(
      and(
        eq(questions.examId, data.examId),
        or(
          eq(questions.syllabusNodeId, data.syllabusNodeId),
          eq(questions.mappedSyllabusNodeId, data.syllabusNodeId),
        ),
      ),
    )
    .limit(40);

  const realSeeds = seedRows.filter(
    (r) => r.sourceType === "real_paper" || r.sourceType === "textbook",
  );
  if (realSeeds.length < MIN_SEEDS) {
    throw new Error(
      `Need at least ${MIN_SEEDS} real/textbook seed questions for this node — found ${realSeeds.length}. Classify more papers or ingest textbook MCQs first.`,
    );
  }

  // Take up to 10 freshest seeds (more = blows token budget).
  const seedsForPrompt: SeedQuestion[] = realSeeds.slice(0, 10).map((r): SeedQuestion => {
    const content = r.content as {
      question?: string;
      options?: string[];
      answer?: number;
      explanation?: string;
    };
    return {
      question: content.question ?? "",
      options: content.options ?? ["", "", "", ""],
      answer: content.answer ?? 0,
      explanation: content.explanation ?? null,
      source:
        r.sourceType === "real_paper"
          ? `${exam.name}${r.paperYear ? ` ${r.paperYear}` : ""}${r.questionNumber ? `, Q.${r.questionNumber}` : ""}`
          : (r.source ?? "Textbook"),
      difficulty: r.difficulty ?? undefined,
      style: r.analyzedStyle ?? undefined,
      year: r.paperYear ?? undefined,
    };
  });

  // 4. Analyze seeds to extract styles + difficulty distribution
  const stylesUsed = Array.from(
    new Set(realSeeds.map((r) => r.analyzedStyle).filter(Boolean) as string[]),
  );
  const difficultyDistribution = computeDifficultyDistribution(realSeeds, data.count);

  // 5. Covered aspects = aspects from prior topic_ai questions for this
  //    node (so we don't regenerate the same angles).
  const priorAiSeeds = seedRows.filter((r) => r.sourceType === "topic_ai");
  const coveredAspects = collectCoveredAspects(priorAiSeeds);
  // Untested aspects are currently unknown to the worker; the
  // generator prompt will infer gaps from the seeds vs coveredAspects.
  // Phase 6+ can fill this with admin-curated untested aspects per node.
  const untestedAspects: string[] = [];

  await job.updateProgress({ stage: "generating", percent: 40 });

  // 6. Call the topic-seeded generator
  const { systemPrompt, prompt } = buildTopicSeededGeneratorPrompt({
    examName: exam.name,
    topicName: node.title,
    unitName,
    seedQuestions: seedsForPrompt,
    coveredAspects,
    untestedAspects,
    difficultyDistribution,
    stylesUsed,
    count: data.count,
    textbookReferences: data.textbookReferences ?? DEFAULT_PHARMACY_TEXTBOOKS,
  });

  const result = await routeAIRequest(
    {
      task: "generate_topic_seeded",
      prompt,
      systemPrompt,
      schema: topicSeededGenerationResponseSchema,
      userId: data.userId,
      examId: data.examId,
    },
    db,
  );

  const generated = result.data.questions;
  const seedQuestionIds = realSeeds.slice(0, 10).map((r) => r.id);
  const modelUsed = result.model ?? result.provider;

  await job.updateProgress({ stage: "saving", percent: 70 });

  // 7. Insert each generated question + queue verification
  let inserted = 0;
  let queued = 0;
  for (const g of generated) {
    try {
      const [newQ] = await db
        .insert(questions)
        .values({
          examId: data.examId,
          type: "mcq",
          content: {
            question: g.question,
            options: g.options,
            answer: g.correctAnswer,
            explanation: g.explanation,
          },
          subject: node.title, // placeholder — Layer 3 verifier will refine
          topic: node.title,
          difficulty: g.difficulty,
          source: `AI — topic-seeded from ${exam.name} ${node.title}`,
          syllabusId: null, // not a generated-per-syllabus record
          syllabusNodeId: data.syllabusNodeId,
          topicName: node.title,
          analyzedStyle: g.style,
          sourceType: "topic_ai",
          sourceDetail: {
            kind: "ai",
            model: modelUsed,
            generationTask: "topic_seeded",
            seedQuestionIds,
            seedPaperYears: Array.from(
              new Set(
                realSeeds
                  .map((r) => r.paperYear)
                  .filter((y): y is number => y !== null && y !== undefined),
              ),
            ),
            promptVersion: "topic-seeded-v1",
            aspectCovered: g.aspectCovered,
            factSource: g.factSource,
          },
          answerSource: "ai_inferred",
          mappedSyllabusNodeId: data.syllabusNodeId,
          verificationStatus: "unverified",
          orgId: data.orgId,
        })
        .returning({ id: questions.id });

      if (!newQ) continue;
      inserted++;

      // Auto-queue verification for the freshly-generated question
      try {
        await addVerifyQuestionJob({
          questionId: newQ.id,
          userId: data.userId,
          orgId: data.orgId,
          autoTriggered: true,
        });
        queued++;
      } catch (err) {
        console.warn(
          `[topic-gen] Failed to queue verification for ${newQ.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    } catch (err) {
      console.warn(
        `[topic-gen] Failed to insert generated question:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  await job.updateProgress({ stage: "done", percent: 100 });
  console.log(
    `[topic-gen] Done: ${inserted}/${generated.length} inserted, ${queued} queued for verification`,
  );

  return {
    success: true,
    questionsGenerated: inserted,
    questionsQueuedForVerification: queued,
    seedsUsed: seedsForPrompt.length,
  };
}

// ─── Helpers ───────────────────────────────────────────

/**
 * Build a difficulty sequence of length `count` that reproduces the
 * proportions seen in the real seeds. Example: 70% medium + 20% hard
 * + 10% easy in seeds, count=10 → 7 medium, 2 hard, 1 easy.
 */
function computeDifficultyDistribution(
  seeds: Array<{ difficulty: string | null }>,
  count: number,
): Array<"easy" | "medium" | "hard"> {
  const counts = { easy: 0, medium: 0, hard: 0 };
  for (const s of seeds) {
    const d = (s.difficulty ?? "medium") as keyof typeof counts;
    if (counts[d] !== undefined) counts[d]++;
  }
  const total = counts.easy + counts.medium + counts.hard;
  if (total === 0) return Array<"easy" | "medium" | "hard">(count).fill("medium");

  const targetEasy = Math.round((counts.easy / total) * count);
  const targetHard = Math.round((counts.hard / total) * count);
  const targetMedium = count - targetEasy - targetHard;

  const out: Array<"easy" | "medium" | "hard"> = [];
  for (let i = 0; i < targetEasy; i++) out.push("easy");
  for (let i = 0; i < targetMedium; i++) out.push("medium");
  for (let i = 0; i < targetHard; i++) out.push("hard");
  return out;
}

/**
 * Pull aspect strings from prior topic_ai questions' sourceDetail so
 * the next batch doesn't duplicate them.
 */
function collectCoveredAspects(priorQuestions: Array<{ sourceDetail: unknown }>): string[] {
  const aspects = new Set<string>();
  for (const q of priorQuestions) {
    const sd = (q.sourceDetail ?? {}) as { aspectCovered?: string };
    if (sd.aspectCovered) aspects.add(sd.aspectCovered);
  }
  return Array.from(aspects);
}
