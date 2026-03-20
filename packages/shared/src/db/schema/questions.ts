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
  vector,
} from "drizzle-orm/pg-core";
import { exams } from "./exams";
import { organizations } from "./organizations";
import { portalDocuments } from "./portal-documents";
import { syllabi } from "./syllabi";
import { syllabusNodes } from "./syllabus-nodes";

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

    orgId: uuid("org_id").references(() => organizations.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("questions_exam_id_idx").on(table.examId),
    index("questions_subject_idx").on(table.subject),
    index("questions_difficulty_idx").on(table.difficulty),
  ],
);
