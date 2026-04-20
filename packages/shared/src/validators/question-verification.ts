/**
 * Question Verification Pipeline — Zod schemas
 *
 * Implements the data contracts from
 * docs/features/QUESTION_ACQUISITION_STRATEGY.md sections 3 and 6.
 *
 *  - Source / answer-source / verification-status / layer / result enums
 *    driving the questions.* columns and question_verifications rows
 *  - Polymorphic `sourceDetail` shape keyed by source type
 *  - Factual verifier AI output (Layer 2)
 *  - Syllabus alignment AI output (Layer 3)
 *  - Topic-seeded generation input
 */

import { z } from "zod";

// ─── Enums ─────────────────────────────────────────────

/**
 * Where the question came from. Drives trust-level badges rendered to
 * users (see section 1 of the strategy doc).
 */
export const sourceTypeEnum = z.enum([
  "real_paper", // Kerala PSC / GPAT / UGC NET etc. — highest trust
  "textbook", // KD Tripathi, Remington, etc. — high trust
  "pattern_ai", // Fingerprint-matched AI — medium trust
  "topic_ai", // Topic-seeded AI (real seeds) — lower trust
  "supplementary_ai", // Syllabus-only AI, no real precedent — lowest
]);
export type SourceType = z.infer<typeof sourceTypeEnum>;

/**
 * Where the answer came from. `official_key` = matched to an official
 * answer key; `textbook` = authored by textbook publisher; `ai_inferred`
 * = AI chose the answer; `unverified` = no verified source.
 */
export const answerSourceEnum = z.enum(["official_key", "textbook", "ai_inferred", "unverified"]);
export type AnswerSource = z.infer<typeof answerSourceEnum>;

/**
 * Lifecycle state of a question in the verification pipeline.
 * Rows start as `unverified`; the composite step flips them to
 * `auto_approved` / `needs_review` / `rejected`; admin review lands
 * at `admin_approved` or `rejected`.
 */
export const verificationStatusEnum = z.enum([
  "unverified",
  "auto_approved",
  "needs_review",
  "admin_approved",
  "rejected",
]);
export type VerificationStatus = z.infer<typeof verificationStatusEnum>;

/**
 * Which layer of the pipeline produced a question_verifications row.
 * Matches the 7-layer flow in section 3.1.
 */
export const verificationLayerEnum = z.enum([
  "source",
  "factual",
  "syllabus",
  "pattern",
  "duplicate",
  "composite",
  "admin",
]);
export type VerificationLayer = z.infer<typeof verificationLayerEnum>;

/** Per-layer verdict. `flag` = needs human review; `skip` = layer
 *  bypassed (e.g. pattern check for real-paper questions). */
export const verificationResultEnum = z.enum(["pass", "fail", "flag", "skip"]);
export type VerificationResult = z.infer<typeof verificationResultEnum>;

// ─── Source detail (polymorphic by sourceType) ─────────

export const realPaperSourceDetailSchema = z.object({
  kind: z.literal("real_paper"),
  conductingBody: z.string(),
  paperYear: z.number().int().optional(),
  paperNumber: z.string().optional(),
  questionNumber: z.number().int().optional(),
  portalDocumentId: z.string().uuid().optional(),
});

export const textbookSourceDetailSchema = z.object({
  kind: z.literal("textbook"),
  textbook: z.string(),
  chapter: z.string().optional(),
  pageNumber: z.number().int().optional(),
  edition: z.string().optional(),
});

export const aiSourceDetailSchema = z.object({
  kind: z.literal("ai"),
  model: z.string(),
  promptVersion: z.string().optional(),
  seedQuestionIds: z.array(z.string().uuid()).optional(),
  seedPaperYears: z.array(z.number().int()).optional(),
  generationTask: z.string().optional(), // e.g. "topic_seeded" | "pattern_matched"
});

export const sourceDetailSchema = z.discriminatedUnion("kind", [
  realPaperSourceDetailSchema,
  textbookSourceDetailSchema,
  aiSourceDetailSchema,
]);
export type SourceDetail = z.infer<typeof sourceDetailSchema>;

// ─── Layer 2: Factual accuracy AI output ───────────────

export const verifierQualityEnum = z.enum(["excellent", "good", "acceptable", "poor", "incorrect"]);

/**
 * Structured output of the Layer 2 factual verifier prompt
 * (see strategy doc §3.2). Verification worker reads this and
 * writes to question_verifications with layer='factual'.
 */
export const factualVerifierResponseSchema = z.object({
  isFactuallyCorrect: z.boolean(),
  isAnswerCorrect: z.boolean(),
  /** If isAnswerCorrect is false, the verifier's picked letter (A-D or text). */
  correctAnswer: z.string().nullable().optional(),
  explanation: z.string(),
  issues: z.array(z.string()).default([]),
  quality: verifierQualityEnum,
  /** 0-1 confidence in this verdict. */
  confidence: z.number().min(0).max(1),
  suggestedFix: z.string().nullable().optional(),
  referenceSource: z.string().nullable().optional(),
});
export type FactualVerifierResponse = z.infer<typeof factualVerifierResponseSchema>;

// ─── Layer 3: Syllabus alignment AI output ─────────────

export const difficultyAppropriatenessEnum = z.enum(["appropriate", "too_easy", "too_hard"]);

export const syllabusAlignmentResponseSchema = z.object({
  inSyllabus: z.boolean(),
  /** syllabus_nodes.id as bigint string — null when inSyllabus is false. */
  syllabusNodeId: z.union([z.number().int(), z.string()]).nullable().optional(),
  mappedUnit: z.string().nullable().optional(),
  mappedTopic: z.string().nullable().optional(),
  /** Has the target exam historically tested this topic? */
  historicallyTested: z.boolean().default(false),
  difficultyAppropriateness: difficultyAppropriatenessEnum,
  /** 0-1 confidence that this question maps to the claimed topic. */
  alignmentScore: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});
export type SyllabusAlignmentResponse = z.infer<typeof syllabusAlignmentResponseSchema>;

// ─── Layer 6: Composite score breakdown ────────────────

export const compositeScoreBreakdownSchema = z.object({
  sourceTrust: z.number().min(0).max(1),
  factualConfidence: z.number().min(0).max(1),
  syllabusAlignment: z.number().min(0).max(1),
  patternMatch: z.number().min(0).max(1),
  uniqueness: z.number().min(0).max(1),
  composite: z.number().min(0).max(1),
  decision: verificationStatusEnum,
});
export type CompositeScoreBreakdown = z.infer<typeof compositeScoreBreakdownSchema>;

// ─── Topic-seeded generation output (section 4.3) ─────

/**
 * One generated question from the topic-seeded prompt. Extends the
 * standard MCQ shape with generator-specific provenance: which aspect
 * it covers (so the worker can avoid duplicates across batches) and
 * which textbook the generator claims supports the fact (so Layer 2
 * has a reference to check against).
 */
export const topicSeededQuestionSchema = z.object({
  question: z.string().min(10),
  options: z.array(z.string()).length(4),
  correctAnswer: z.number().int().min(0).max(3),
  explanation: z.string().min(10),
  difficulty: z.enum(["easy", "medium", "hard"]),
  style: z.string(),
  /** Specific aspect of the topic this question tests — used to de-dupe
   *  across batches (e.g. "CYP450 2C9 substrate drugs"). */
  aspectCovered: z.string(),
  /** Textbook reference the generator claims supports the fact, for
   *  downstream factual verification (e.g. "KD Tripathi Ch.12 pg.145"). */
  factSource: z.string(),
});
export type TopicSeededQuestion = z.infer<typeof topicSeededQuestionSchema>;

export const topicSeededGenerationResponseSchema = z.object({
  questions: z.array(topicSeededQuestionSchema),
});
export type TopicSeededGenerationResponse = z.infer<typeof topicSeededGenerationResponseSchema>;

// ─── Topic-seeded generation input (section 4.3) ───────

export const topicSeededGenerationInputSchema = z.object({
  examId: z.string().uuid(),
  /** syllabus_nodes.id (bigint as number). Generator pulls seed questions
   *  matching this node via questions.mappedSyllabusNodeId. */
  syllabusNodeId: z.number().int(),
  /** How many new questions to generate this batch. */
  count: z.number().int().min(1).max(50).default(10),
  /** If true, the generator will skip aspects already covered by seeds;
   *  false = rephrase/variant around same aspects for volume. */
  skipCoveredAspects: z.boolean().default(true),
  /** Optional: which textbooks the verifier should cite by default. */
  textbookReferences: z.array(z.string()).optional(),
});
export type TopicSeededGenerationInput = z.infer<typeof topicSeededGenerationInputSchema>;

// ─── Admin queue / filter input ────────────────────────

export const listVerificationQueueInputSchema = z.object({
  examId: z.string().uuid().optional(),
  status: verificationStatusEnum.optional(),
  /** Filter by source type for "show only AI questions" style queries. */
  sourceType: sourceTypeEnum.optional(),
  /** Lower bound on composite score (for e.g. "show borderline items"). */
  minScore: z.number().min(0).max(1).optional(),
  maxScore: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export type ListVerificationQueueInput = z.infer<typeof listVerificationQueueInputSchema>;

export const reviewQuestionInputSchema = z.object({
  questionId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  notes: z.string().max(2000).optional(),
  /** Optional corrections to apply before approving (edit in place). */
  edits: z
    .object({
      question: z.string().optional(),
      options: z.array(z.string()).optional(),
      answer: z.number().int().min(0).max(7).optional(),
      explanation: z.string().optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    })
    .optional(),
});
export type ReviewQuestionInput = z.infer<typeof reviewQuestionInputSchema>;
