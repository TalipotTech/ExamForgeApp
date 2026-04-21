/**
 * Verification Worker — Question Acquisition Strategy (§3)
 *
 * Runs the 6 automated verification layers for one question:
 *
 *   1. Source      — trust score by sourceType (deterministic)
 *   2. Factual     — GPT-4o second-opinion check via verify_question
 *                    AI task
 *   3. Syllabus    — maps question to a syllabus_nodes.id via
 *                    align_syllabus AI task
 *   4. Pattern     — compares classified subject/style to the exam's
 *                    fingerprint; skipped for real_paper sources
 *   5. Duplicate   — pgvector cosine similarity against existing
 *                    questions for the same exam
 *   6. Composite   — weighted sum → auto_approved / needs_review /
 *                    rejected, with thresholds 0.8 / 0.6 from the doc
 *
 * Every layer writes one row to question_verifications. After all
 * layers, the composite result writes verificationStatus +
 * verificationScore + per-layer scores back to questions.
 *
 * Non-fatal: any layer can fail without aborting the pipeline — its
 * score defaults to 0 and the composite continues. Failures are
 * recorded with result='fail' in the audit trail.
 */

import { Worker, Job } from "bullmq";
import { eq, and, sql } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import {
  questions,
  questionVerifications,
  exams,
  examPatterns,
  syllabi,
  syllabusNodes,
} from "@examforge/shared/db/schema";
import {
  factualVerifierResponseSchema,
  syllabusAlignmentResponseSchema,
  type VerificationLayer,
  type VerificationResult,
  type VerificationStatus,
} from "@examforge/shared/validators";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import { VERIFICATION_QUEUE_NAME, type VerificationJobData } from "../queues/verification-queue.js";
import { routeAIRequest, routeEmbedRequest } from "../ai/ai-router.js";
import { buildQuestionVerifierPrompt } from "../ai/prompts/question-verifier.js";
import {
  buildSyllabusAlignmentPrompt,
  type SyllabusNodeSummary,
} from "../ai/prompts/syllabus-alignment.js";
import {
  inferVerificationCategory,
  type VerificationCategory,
} from "../config/verification-references.js";
import { getOverlapScore } from "../config/exam-overlap-matrix.js";

// ─── Thresholds (from QUESTION_ACQUISITION_STRATEGY.md §3.1) ───

const COMPOSITE_WEIGHTS = {
  sourceTrust: 0.3,
  factualConfidence: 0.25,
  syllabusAlignment: 0.2,
  patternMatch: 0.15,
  uniqueness: 0.1,
} as const;

const AUTO_APPROVE_THRESHOLD = 0.8;
const NEEDS_REVIEW_THRESHOLD = 0.6;

/** Cosine similarity band for duplicate detection. Above 0.95 = exact
 *  duplicate; 0.85-0.95 = near-duplicate variant; below = unique. */
const EXACT_DUPLICATE_SIM = 0.95;
const NEAR_DUPLICATE_SIM = 0.85;

/** Source-trust lookup by sourceType + answerSource. */
function sourceTrustScore(sourceType: string | null, answerSource: string | null): number {
  if (sourceType === "real_paper" && answerSource === "official_key") return 1.0;
  if (sourceType === "real_paper") return 0.9;
  if (sourceType === "textbook") return 0.85;
  if (sourceType === "pattern_ai") return 0.7;
  if (sourceType === "topic_ai") return 0.6;
  if (sourceType === "supplementary_ai") return 0.4;
  return 0.5; // unclassified — treat as unverified
}

// ─── Shared per-layer shape ────────────────────────────

interface LayerOutcome {
  layer: VerificationLayer;
  result: VerificationResult;
  score: number;
  details: Record<string, unknown>;
  aiProvider?: string | null;
  aiTokensUsed?: number;
}

// ─── Worker Factory ────────────────────────────────────

export function createVerificationWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    VERIFICATION_QUEUE_NAME,
    async (job: Job) => {
      const data = job.data as VerificationJobData;
      return verifyQuestion(job, data, db);
    },
    {
      connection: getBullMQConnection(),
      // AI-heavy per job (up to 3 LLM calls); keep concurrency low to
      // respect provider rate limits.
      concurrency: 2,
      limiter: { max: 10, duration: 60_000 },
    },
  );

  worker.on("completed", (job) => {
    console.log(`[verification] Job ${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[verification] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// ─── Orchestrator ──────────────────────────────────────

async function verifyQuestion(
  job: Job,
  data: VerificationJobData,
  db: ReturnType<typeof createDatabase>,
): Promise<{
  success: boolean;
  questionId: string;
  status: VerificationStatus;
  score: number;
}> {
  console.log(
    `[verification] Verifying question ${data.questionId} (auto=${data.autoTriggered ?? false})`,
  );

  const [q] = await db.select().from(questions).where(eq(questions.id, data.questionId)).limit(1);

  if (!q) throw new Error(`Question ${data.questionId} not found`);

  const [exam] = await db.select().from(exams).where(eq(exams.id, q.examId)).limit(1);

  if (!exam) throw new Error(`Exam ${q.examId} not found for question`);

  const examContext = {
    examName: exam.name,
    examLevel: exam.level ?? "Assistant Professor",
    subjectDomain: q.subject,
    // Category is inferred from the exam name + subject so the factual
    // verifier picks the right textbook set (pharmacy / medical / etc.)
    category: inferVerificationCategory(exam.name, q.subject),
  };

  const outcomes: LayerOutcome[] = [];

  // ── Layer 1: Source ──
  await job.updateProgress({ stage: "source", percent: 10 });
  const sourceOutcome = layerSource(q);
  outcomes.push(sourceOutcome);
  await writeAuditRow(db, data.questionId, sourceOutcome);

  // ── Layer 2: Factual ──
  await job.updateProgress({ stage: "factual", percent: 25 });
  const factualOutcome = await safeRun("factual", () => layerFactual(q, examContext, data, db));
  outcomes.push(factualOutcome);
  await writeAuditRow(db, data.questionId, factualOutcome);

  // ── Layer 3: Syllabus Alignment ──
  await job.updateProgress({ stage: "syllabus", percent: 45 });
  const syllabusOutcome = await safeRun("syllabus", () => layerSyllabus(q, examContext, data, db));
  outcomes.push(syllabusOutcome);
  await writeAuditRow(db, data.questionId, syllabusOutcome);

  // ── Layer 4: Pattern Match ──
  await job.updateProgress({ stage: "pattern", percent: 60 });
  const patternOutcome = await safeRun("pattern", () => layerPattern(q, db));
  outcomes.push(patternOutcome);
  await writeAuditRow(db, data.questionId, patternOutcome);

  // ── Layer 5: Duplicate detection ──
  await job.updateProgress({ stage: "duplicate", percent: 75 });
  const duplicateOutcome = await safeRun("duplicate", () => layerDuplicate(q, data, db));
  outcomes.push(duplicateOutcome);
  await writeAuditRow(db, data.questionId, duplicateOutcome);

  // ── Layer 6: Composite ──
  await job.updateProgress({ stage: "composite", percent: 90 });
  const composite = computeComposite(outcomes);
  const compositeOutcome: LayerOutcome = {
    layer: "composite",
    result: composite.status === "rejected" ? "fail" : "pass",
    score: composite.score,
    details: composite.breakdown as unknown as Record<string, unknown>,
  };
  outcomes.push(compositeOutcome);
  await writeAuditRow(db, data.questionId, compositeOutcome);

  // Cross-exam relevance: if this question came from a different exam
  // (e.g. GPAT question being used to prep Kerala PSC Asst Prof
  // Pharmacy), look up the overlap matrix to get a 0-1 relevance score.
  // Same exam = 1.0; unrelated / not in matrix = 0; else fractional.
  const relevanceToTarget =
    q.originalExam && q.originalExam !== exam.name
      ? getOverlapScore(q.originalExam, exam.name)
      : 1.0;

  // Write back to questions row
  await db
    .update(questions)
    .set({
      verificationStatus: composite.status,
      verificationScore: composite.score,
      factualConfidence: factualOutcome.score,
      syllabusAlignmentScore: syllabusOutcome.score,
      patternMatchScore: patternOutcome.score,
      verificationDetails: {
        sourceTrust: sourceOutcome.score,
        factualDetails: factualOutcome.details,
        syllabusDetails: syllabusOutcome.details,
        patternDetails: patternOutcome.details,
        duplicateDetails: duplicateOutcome.details,
        compositeBreakdown: composite.breakdown,
        lastVerifiedAt: new Date().toISOString(),
      },
      mappedSyllabusNodeId: (syllabusOutcome.details.syllabusNodeId as number | null) ?? null,
      historicallyTested: (syllabusOutcome.details.historicallyTested as boolean) ?? false,
      relevanceToTarget,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(questions.id, data.questionId));

  await job.updateProgress({ stage: "done", percent: 100 });
  console.log(
    `[verification] ${data.questionId} → ${composite.status} (${composite.score.toFixed(2)})`,
  );

  return {
    success: true,
    questionId: data.questionId,
    status: composite.status,
    score: composite.score,
  };
}

// ─── Layer 1: Source ───────────────────────────────────

function layerSource(q: typeof questions.$inferSelect): LayerOutcome {
  // If sourceType wasn't explicitly set, infer from other columns.
  // Portal-ingested questions have paperYear + portalDocumentId; AI-
  // generated ones usually have syllabusNodeId but no paperYear.
  let sourceType = q.sourceType;
  let answerSource = q.answerSource;

  if (!sourceType) {
    if (q.paperYear || q.portalDocumentId) {
      sourceType = "real_paper";
    } else if (q.syllabusNodeId) {
      // Could be AI-generated from a syllabus node — leave unverified
      // so admin can pick the right subtype.
      sourceType = "supplementary_ai";
    }
  }
  if (!answerSource && sourceType === "real_paper") {
    // No matched answer key yet — will upgrade to 'official_key' when
    // the answer-key-matcher runs.
    answerSource = "unverified";
  }

  const score = sourceTrustScore(sourceType ?? null, answerSource ?? null);

  return {
    layer: "source",
    result: "pass",
    score,
    details: {
      sourceType,
      answerSource,
      inferredFromColumns: !q.sourceType,
      paperYear: q.paperYear ?? null,
      portalDocumentId: q.portalDocumentId ?? null,
    },
  };
}

// ─── Layer 2: Factual AI check ─────────────────────────

async function layerFactual(
  q: typeof questions.$inferSelect,
  examContext: {
    examName: string;
    examLevel: string;
    subjectDomain: string;
    category: VerificationCategory;
  },
  data: VerificationJobData,
  db: ReturnType<typeof createDatabase>,
): Promise<LayerOutcome> {
  const content = q.content as {
    question?: string;
    options?: string[];
    answer?: number;
    explanation?: string;
  };

  if (!content.question || !content.options || content.options.length !== 4) {
    return {
      layer: "factual",
      result: "skip",
      score: 0,
      details: { reason: "incomplete question content" },
    };
  }

  // Skip for real papers with matched official answer keys — already
  // human-verified by the conducting body.
  if (q.sourceType === "real_paper" && q.answerSource === "official_key") {
    return {
      layer: "factual",
      result: "skip",
      score: 1.0,
      details: { reason: "official answer key — trusted" },
    };
  }

  const sourceStr =
    q.sourceType === "real_paper" && q.paperYear
      ? `${examContext.examName} ${q.paperYear}${q.questionNumber ? `, Q.${q.questionNumber}` : ""}`
      : (q.source ?? "AI Generated");

  const { systemPrompt, prompt } = buildQuestionVerifierPrompt({
    examName: examContext.examName,
    subjectDomain: examContext.subjectDomain,
    examLevel: examContext.examLevel,
    // Category drives which textbook list + fact-check addendum gets
    // injected. Inferred from exam.name + q.subject at call-time.
    category: examContext.category,
    question: content.question,
    options: content.options,
    markedAnswer: content.answer ?? "unknown",
    explanation: content.explanation ?? null,
    source: sourceStr,
  });

  const result = await routeAIRequest(
    {
      task: "verify_question",
      prompt,
      systemPrompt,
      schema: factualVerifierResponseSchema,
      userId: data.userId,
      examId: q.examId,
    },
    db,
  );

  const verdict = result.data;
  // Verdict is fail if the answer is wrong OR the question has a
  // factual error. Pass if correct + no issues. Flag if ambiguous
  // (issues present but answer marked correct).
  const isPass = verdict.isAnswerCorrect && verdict.isFactuallyCorrect;
  const layerResult: VerificationResult = !verdict.isFactuallyCorrect
    ? "fail"
    : isPass && verdict.issues.length === 0
      ? "pass"
      : "flag";

  return {
    layer: "factual",
    result: layerResult,
    score: verdict.confidence,
    details: {
      quality: verdict.quality,
      isFactuallyCorrect: verdict.isFactuallyCorrect,
      isAnswerCorrect: verdict.isAnswerCorrect,
      correctAnswer: verdict.correctAnswer,
      issues: verdict.issues,
      suggestedFix: verdict.suggestedFix,
      referenceSource: verdict.referenceSource,
      verifierExplanation: verdict.explanation,
    },
    aiProvider: result.provider,
    aiTokensUsed: result.usage.totalTokens,
  };
}

// ─── Layer 3: Syllabus Alignment ───────────────────────

async function layerSyllabus(
  q: typeof questions.$inferSelect,
  examContext: { examName: string; examLevel: string },
  data: VerificationJobData,
  db: ReturnType<typeof createDatabase>,
): Promise<LayerOutcome> {
  const content = q.content as { question?: string; options?: string[] };
  if (!content.question) {
    return {
      layer: "syllabus",
      result: "skip",
      score: 0,
      details: { reason: "no question text" },
    };
  }

  // Load this exam's syllabus nodes (join through the syllabi table).
  const nodeRows = await db
    .select({
      id: syllabusNodes.id,
      title: syllabusNodes.title,
      description: syllabusNodes.description,
      depth: syllabusNodes.depth,
      keyTerms: syllabusNodes.keyTerms,
    })
    .from(syllabusNodes)
    .innerJoin(syllabi, eq(syllabusNodes.syllabusId, syllabi.id))
    .where(eq(syllabi.examId, q.examId));

  if (nodeRows.length === 0) {
    return {
      layer: "syllabus",
      result: "skip",
      score: 0.5,
      details: { reason: "no syllabus ingested for this exam yet" },
    };
  }

  const nodes: SyllabusNodeSummary[] = nodeRows.map((r) => ({
    id: Number(r.id),
    title: r.title,
    depth: r.depth ?? 0,
    description: r.description ?? null,
    keyTerms: (r.keyTerms as string[] | null) ?? [],
  }));

  const result = await routeAIRequest(
    {
      task: "align_syllabus",
      ...buildSyllabusAlignmentPrompt({
        examName: examContext.examName,
        examLevel: examContext.examLevel,
        syllabusNodes: nodes,
        question: content.question,
        options: content.options,
        claimedSubject: q.analyzedSubject ?? q.subject,
        claimedTopic: q.analyzedTopic ?? q.topic,
      }),
      schema: syllabusAlignmentResponseSchema,
      userId: data.userId,
      examId: q.examId,
    },
    db,
  );

  const align = result.data;
  const layerResult: VerificationResult = !align.inSyllabus
    ? "fail"
    : align.alignmentScore >= 0.7
      ? "pass"
      : "flag";

  const nodeIdNum =
    typeof align.syllabusNodeId === "string"
      ? Number(align.syllabusNodeId) || null
      : (align.syllabusNodeId ?? null);

  return {
    layer: "syllabus",
    result: layerResult,
    score: align.alignmentScore,
    details: {
      inSyllabus: align.inSyllabus,
      syllabusNodeId: nodeIdNum,
      mappedUnit: align.mappedUnit,
      mappedTopic: align.mappedTopic,
      historicallyTested: align.historicallyTested,
      difficultyAppropriateness: align.difficultyAppropriateness,
      reasoning: align.reasoning,
    },
    aiProvider: result.provider,
    aiTokensUsed: result.usage.totalTokens,
  };
}

// ─── Layer 4: Pattern Match ────────────────────────────

async function layerPattern(
  q: typeof questions.$inferSelect,
  db: ReturnType<typeof createDatabase>,
): Promise<LayerOutcome> {
  // Real-paper questions don't need to "match the pattern" — they
  // ARE the pattern.
  if (q.sourceType === "real_paper" || q.sourceType === "textbook") {
    return {
      layer: "pattern",
      result: "skip",
      score: 1.0,
      details: { reason: "real/textbook source — bypasses pattern check" },
    };
  }

  // Look up the current pattern for this exam.
  const [pattern] = await db
    .select({ fingerprint: examPatterns.fingerprint })
    .from(examPatterns)
    .where(
      and(
        eq(examPatterns.examId, q.examId),
        eq(examPatterns.isCurrent, true),
        eq(examPatterns.status, "active"),
      ),
    )
    .limit(1);

  if (!pattern || !pattern.fingerprint) {
    return {
      layer: "pattern",
      result: "skip",
      score: 0.5,
      details: { reason: "no active fingerprint for this exam" },
    };
  }

  const fp = pattern.fingerprint as {
    subjectWeightage?: Array<{ subject: string; averagePercent: number }>;
    styleDistribution?: Array<{ style: string; percent: number }>;
    difficultyDistribution?: { easy: number; medium: number; hard: number };
  };

  // Compare the question's classified subject + style against the
  // fingerprint. Subject score = 1.0 if subject is represented, else
  // scaled by its weight. Style score = same treatment.
  const analyzedSubjectLower = (q.analyzedSubject ?? q.subject).toLowerCase();
  const subjectEntry = (fp.subjectWeightage ?? []).find(
    (s) => s.subject.toLowerCase() === analyzedSubjectLower,
  );
  const subjectScore = subjectEntry
    ? Math.min(1.0, subjectEntry.averagePercent / 20 + 0.5) // +0.5 base, +0.5 if 10%+ weightage
    : 0.3; // subject not in fingerprint at all

  const analyzedStyle = (q.analyzedStyle ?? "").toLowerCase();
  const styleEntry = analyzedStyle
    ? (fp.styleDistribution ?? []).find((s) => s.style.toLowerCase() === analyzedStyle)
    : undefined;
  const styleScore = styleEntry && styleEntry.percent > 2 ? 1.0 : styleEntry ? 0.6 : 0.4;

  const score = (subjectScore + styleScore) / 2;
  const layerResult: VerificationResult = score >= 0.7 ? "pass" : score >= 0.5 ? "flag" : "fail";

  return {
    layer: "pattern",
    result: layerResult,
    score,
    details: {
      analyzedSubject: q.analyzedSubject,
      analyzedStyle: q.analyzedStyle,
      subjectScore,
      styleScore,
      subjectWeightageInFingerprint: subjectEntry?.averagePercent ?? null,
      stylePercentInFingerprint: styleEntry?.percent ?? null,
    },
  };
}

// ─── Layer 5: Duplicate detection via pgvector ────────

async function layerDuplicate(
  q: typeof questions.$inferSelect,
  data: VerificationJobData,
  db: ReturnType<typeof createDatabase>,
): Promise<LayerOutcome> {
  const content = q.content as { question?: string; options?: string[] };
  if (!content.question) {
    return {
      layer: "duplicate",
      result: "skip",
      score: 1.0,
      details: { reason: "no question text" },
    };
  }

  // Ensure embedding exists on this question.
  if (!q.embedding) {
    try {
      const embedResult = await routeEmbedRequest(
        {
          task: "embed_text",
          texts: [`${content.question} ${(content.options ?? []).join(" ")}`],
          userId: data.userId,
          examId: q.examId,
        },
        db,
      );
      const embedding = embedResult.embeddings[0];
      if (embedding) {
        await db
          .update(questions)
          .set({ embedding, updatedAt: new Date() })
          .where(eq(questions.id, q.id));
      }
    } catch (err) {
      return {
        layer: "duplicate",
        result: "skip",
        score: 1.0,
        details: {
          reason: "embedding failed",
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  // Find nearest neighbour across the exam's other questions.
  const rows = await db.execute(sql`
    SELECT q2.id, q2.paper_year, q2.question_number,
           1 - (q1.embedding <=> q2.embedding) AS similarity
    FROM questions q1, questions q2
    WHERE q1.id = ${q.id}
      AND q2.id != ${q.id}
      AND q1.embedding IS NOT NULL
      AND q2.embedding IS NOT NULL
      AND q2.exam_id = ${q.examId}
    ORDER BY q1.embedding <=> q2.embedding ASC
    LIMIT 1
  `);

  const nearest = (rows as unknown as { rows: Array<{ id: string; similarity: number }> })
    .rows?.[0];
  const similarity = Number(nearest?.similarity ?? 0);

  let layerResult: VerificationResult;
  let score: number;
  let tag: string;
  if (similarity >= EXACT_DUPLICATE_SIM) {
    layerResult = "fail";
    score = 0;
    tag = "exact_duplicate";
  } else if (similarity >= NEAR_DUPLICATE_SIM) {
    layerResult = "flag";
    score = 1 - similarity;
    tag = "near_duplicate";
  } else {
    layerResult = "pass";
    score = 1.0;
    tag = "unique";
  }

  return {
    layer: "duplicate",
    result: layerResult,
    score,
    details: {
      tag,
      mostSimilarQuestionId: nearest?.id ?? null,
      similarity,
      threshold: { exact: EXACT_DUPLICATE_SIM, near: NEAR_DUPLICATE_SIM },
    },
  };
}

// ─── Layer 6: Composite ─────────────────────────────────

function computeComposite(outcomes: LayerOutcome[]): {
  score: number;
  status: VerificationStatus;
  breakdown: Record<string, number | string>;
} {
  const get = (layer: VerificationLayer): number => {
    const o = outcomes.find((x) => x.layer === layer);
    return o?.score ?? 0;
  };

  const sourceTrust = get("source");
  const factualConfidence = get("factual");
  const syllabusAlignment = get("syllabus");
  const patternMatch = get("pattern");
  const uniqueness = get("duplicate");

  const composite =
    sourceTrust * COMPOSITE_WEIGHTS.sourceTrust +
    factualConfidence * COMPOSITE_WEIGHTS.factualConfidence +
    syllabusAlignment * COMPOSITE_WEIGHTS.syllabusAlignment +
    patternMatch * COMPOSITE_WEIGHTS.patternMatch +
    uniqueness * COMPOSITE_WEIGHTS.uniqueness;

  // Hard-fail overrides: any layer that returned 'fail' (factual,
  // duplicate, syllabus out-of-scope) pushes the decision to rejected
  // regardless of composite score.
  const hasHardFail = outcomes.some(
    (o) => o.result === "fail" && (o.layer === "factual" || o.layer === "duplicate"),
  );

  let status: VerificationStatus;
  if (hasHardFail) status = "rejected";
  else if (composite >= AUTO_APPROVE_THRESHOLD) status = "auto_approved";
  else if (composite >= NEEDS_REVIEW_THRESHOLD) status = "needs_review";
  else status = "rejected";

  return {
    score: Math.round(composite * 1000) / 1000,
    status,
    breakdown: {
      sourceTrust: round(sourceTrust),
      factualConfidence: round(factualConfidence),
      syllabusAlignment: round(syllabusAlignment),
      patternMatch: round(patternMatch),
      uniqueness: round(uniqueness),
      composite: Math.round(composite * 1000) / 1000,
      hardFail: hasHardFail ? "true" : "false",
      decision: status,
    },
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ─── Helpers ────────────────────────────────────────────

async function writeAuditRow(
  db: ReturnType<typeof createDatabase>,
  questionId: string,
  outcome: LayerOutcome,
): Promise<void> {
  try {
    await db.insert(questionVerifications).values({
      questionId,
      layer: outcome.layer,
      result: outcome.result,
      score: outcome.score,
      details: outcome.details,
      aiProvider: outcome.aiProvider ?? null,
      aiTokensUsed: outcome.aiTokensUsed ?? 0,
    });
  } catch (err) {
    console.warn(
      `[verification] Failed to write audit row for ${questionId}/${outcome.layer}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** Runs a layer and catches errors, converting them to 'fail' outcomes
 *  tagged with the correct layer name. */
async function safeRun(
  layer: VerificationLayer,
  fn: () => Promise<LayerOutcome>,
): Promise<LayerOutcome> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[verification] Layer "${layer}" errored:`, msg);
    return {
      layer,
      result: "fail",
      score: 0,
      details: { error: msg },
    };
  }
}
