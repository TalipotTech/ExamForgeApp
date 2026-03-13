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
import { portalDocuments } from "./portal-documents";
import { exams } from "./exams";
import { organizations } from "./organizations";
import { users } from "./users";
import { questions } from "./questions";

export const stagedQuestions = pgTable(
  "staged_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Source tracking
    portalDocumentId: uuid("portal_document_id")
      .references(() => portalDocuments.id)
      .notNull(),

    // Exam mapping (admin sets during review)
    examId: uuid("exam_id").references(() => exams.id),
    suggestedExamName: varchar("suggested_exam_name", { length: 500 }),

    // Question data (mirrors questions table structure)
    type: varchar("type", { length: 20 }).notNull().default("mcq"),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    subject: varchar("subject", { length: 255 }),
    topic: varchar("topic", { length: 255 }),
    difficulty: varchar("difficulty", { length: 20 }).default("medium"),
    source: varchar("source", { length: 500 }),

    // Paper metadata
    paperYear: integer("paper_year"),
    paperNumber: varchar("paper_number", { length: 50 }),
    questionNumber: integer("question_number"),

    // Review workflow
    reviewStatus: varchar("review_status", { length: 20 }).notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    rejectionReason: text("rejection_reason"),
    approvedQuestionId: uuid("approved_question_id").references(() => questions.id),

    // Multi-tenancy
    orgId: uuid("org_id")
      .references(() => organizations.id)
      .notNull(),

    // Metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_staged_q_portal_doc").on(table.portalDocumentId),
    index("idx_staged_q_review_status").on(table.reviewStatus),
    index("idx_staged_q_exam").on(table.examId),
    index("idx_staged_q_org").on(table.orgId),
  ],
);
