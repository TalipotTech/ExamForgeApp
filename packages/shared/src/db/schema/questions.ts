import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  pgEnum,
  index,
  integer,
  bigint,
  boolean,
  vector,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { exams } from "./exams";
import { organizations } from "./organizations";
import { portalDocuments } from "./portal-documents";
import { syllabi } from "./syllabi";
import { syllabusNodes } from "./syllabus-nodes";
import { users } from "./users";

export const difficultyEnum = pgEnum("difficulty", ["easy", "medium", "hard"]);

export const questionTypeEnum = pgEnum("question_type", [
  "mcq",
  "true_false",
  "fill_blank",
  "match",
  "assertion",
]);

export type TranslationContent = {
  question: string;
  options: string[];
  explanation: string;
};

export type Translations = {
  hi?: TranslationContent;
  ta?: TranslationContent;
  ml?: TranslationContent;
};

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),
    type: questionTypeEnum("type").notNull().default("mcq"),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    topic: varchar("topic", { length: 255 }),
    difficulty: difficultyEnum("difficulty").notNull().default("medium"),
    source: varchar("source", { length: 500 }),
    translations: jsonb("translations").$type<Translations>(),
    embedding: vector("embedding", { dimensions: 1536 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    // Portal source tracking
    portalDocumentId: uuid("portal_document_id").references(() => portalDocuments.id),
    paperYear: integer("paper_year"),
    paperNumber: varchar("paper_number", { length: 50 }),
    questionNumber: integer("question_number"),

    // Syllabus / topic tracking (for AI-generated questions)
    syllabusId: bigint("syllabus_id", { mode: "number" }).references(() => syllabi.id),
    syllabusName: varchar("syllabus_name", { length: 500 }),
    syllabusNodeId: bigint("syllabus_node_id", { mode: "number" }).references(
      () => syllabusNodes.id,
    ),
    topicName: varchar("topic_name", { length: 500 }),

    // Pattern analysis (populated by classification worker)
    analyzedSubject: varchar("analyzed_subject", { length: 255 }),
    analyzedTopic: varchar("analyzed_topic", { length: 255 }),
    analyzedSubtopic: varchar("analyzed_subtopic", { length: 255 }),
    analyzedStyle: varchar("analyzed_style", { length: 50 }),
    isRepeated: boolean("is_repeated").default(false),
    repeatedFrom: jsonb("repeated_from")
      .$type<{ year: number; paperNumber?: string; questionNumber?: number }[]>()
      .default([]),
    patternTags: jsonb("pattern_tags").$type<string[]>().default([]),

    // Verification pipeline (Question Acquisition Strategy)
    // See docs/features/QUESTION_ACQUISITION_STRATEGY.md
    sourceType: varchar("source_type", { length: 30 }),
    // real_paper | textbook | pattern_ai | topic_ai | supplementary_ai
    sourceDetail: jsonb("source_detail").$type<Record<string, unknown>>().default({}),
    // { paperYear, paperNumber, questionNumber, conductingBody } — real_paper
    // { textbook, chapter, pageNumber } — textbook
    // { model, promptVersion, seedQuestionIds } — AI
    answerSource: varchar("answer_source", { length: 30 }),
    // official_key | textbook | ai_inferred | unverified
    verificationStatus: varchar("verification_status", { length: 20 }).default("unverified"),
    // unverified | auto_approved | needs_review | admin_approved | rejected
    verificationScore: doublePrecision("verification_score"),
    factualConfidence: doublePrecision("factual_confidence"),
    syllabusAlignmentScore: doublePrecision("syllabus_alignment_score"),
    patternMatchScore: doublePrecision("pattern_match_score"),
    verificationDetails: jsonb("verification_details").$type<Record<string, unknown>>().default({}),
    verifiedBy: uuid("verified_by").references(() => users.id),
    verifiedAt: timestamp("verified_at"),
    mappedSyllabusNodeId: bigint("mapped_syllabus_node_id", { mode: "number" }).references(
      () => syllabusNodes.id,
    ),
    historicallyTested: boolean("historically_tested").default(false),
    // For cross-exam questions (e.g. GPAT used to prep for Kerala PSC Asst Prof Pharmacy)
    originalExam: varchar("original_exam", { length: 255 }),
    relevanceToTarget: doublePrecision("relevance_to_target").default(1.0),

    orgId: uuid("org_id").references(() => organizations.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("questions_exam_id_idx").on(table.examId),
    index("questions_subject_idx").on(table.subject),
    index("questions_difficulty_idx").on(table.difficulty),
    index("questions_analyzed_subject_idx").on(table.analyzedSubject),
    index("questions_is_repeated_idx").on(table.isRepeated),
    index("questions_verification_status_idx").on(table.verificationStatus),
    index("questions_mapped_syllabus_node_idx").on(table.mappedSyllabusNodeId),
    index("questions_source_type_idx").on(table.sourceType),
  ],
);
