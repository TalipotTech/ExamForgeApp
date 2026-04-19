import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  integer,
  text,
  index,
} from "drizzle-orm/pg-core";
import { exams } from "./exams";
import { examPatterns } from "./exam-patterns";
import { portalDocuments } from "./portal-documents";
import { organizations } from "./organizations";

export type RepeatedFromEntry = {
  questionNumber: number;
  matchedPaper: string;
  similarity: number;
};

export const paperAnalysis = pgTable(
  "paper_analysis",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),
    examPatternId: uuid("exam_pattern_id").references(() => examPatterns.id),

    // Paper identification
    year: integer("year").notNull(),
    paperNumber: varchar("paper_number", { length: 50 }),
    source: varchar("source", { length: 255 }),
    portalDocumentId: uuid("portal_document_id").references(() => portalDocuments.id),

    // Paper stats
    totalQuestions: integer("total_questions").notNull(),
    questionsWithAnswers: integer("questions_with_answers"),
    subjectDistribution: jsonb("subject_distribution").$type<Record<string, number>>().notNull(),
    topicDistribution: jsonb("topic_distribution").$type<Record<string, number>>().notNull(),
    difficultyDistribution: jsonb("difficulty_distribution")
      .$type<Record<string, number>>()
      .notNull(),
    styleDistribution: jsonb("style_distribution").$type<Record<string, number>>().notNull(),

    // Repeat analysis
    repeatedQuestions: integer("repeated_questions").default(0),
    repeatedFrom: jsonb("repeated_from").$type<RepeatedFromEntry[]>().default([]),

    // Raw analysis
    analysisJson: jsonb("analysis_json").$type<Record<string, unknown>>().notNull(),
    aiProvider: varchar("ai_provider", { length: 50 }),
    aiTokensUsed: integer("ai_tokens_used").default(0),

    // Status
    status: varchar("status", { length: 20 }).default("pending"),
    errorMessage: text("error_message"),

    orgId: uuid("org_id").references(() => organizations.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_paper_analysis_exam").on(table.examId),
    index("idx_paper_analysis_portal_doc").on(table.portalDocumentId),
  ],
);
