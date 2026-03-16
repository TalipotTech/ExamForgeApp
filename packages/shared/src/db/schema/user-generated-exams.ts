import {
  pgTable,
  bigserial,
  bigint,
  uuid,
  varchar,
  timestamp,
  text,
  integer,
  jsonb,
  real,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { exams } from "./exams";
import { syllabusNodes } from "./syllabus-nodes";
import { tutorialFiles } from "./tutorial-files";

export type UserGeneratedQuestion = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  subject: string;
  questionNumber: number;
};

export const userGeneratedExams = pgTable(
  "user_generated_exams",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),
    syllabusNodeId: bigint("syllabus_node_id", { mode: "number" }).references(
      () => syllabusNodes.id,
    ),

    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),

    // Question storage
    questions: jsonb("questions").$type<UserGeneratedQuestion[]>().notNull(),
    questionCount: integer("question_count").notNull(),
    difficultyDistribution: jsonb("difficulty_distribution")
      .$type<{ easy: number; medium: number; hard: number }>()
      .default({ easy: 0, medium: 0, hard: 0 }),
    timeLimitMinutes: integer("time_limit_minutes"),

    // Generation info
    aiProvider: varchar("ai_provider", { length: 50 }),
    aiTokensUsed: integer("ai_tokens_used").default(0),
    aiCostUsd: real("ai_cost_usd").default(0),
    sourceTutorialId: bigint("source_tutorial_id", { mode: "number" }).references(
      () => tutorialFiles.id,
    ),
    sourceNodeIds: jsonb("source_node_ids").$type<number[]>(),
    questionHashes: jsonb("question_hashes").$type<string[]>(),

    // Usage
    timesAttempted: integer("times_attempted").default(0),
    bestScore: real("best_score"),
    lastAttemptedAt: timestamp("last_attempted_at"),
    lastAttemptAnswers: jsonb("last_attempt_answers").$type<Record<string, number>>(),

    // Ownership
    ownerType: varchar("owner_type", { length: 10 }).notNull().default("user"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    visibility: varchar("visibility", { length: 20 }).notNull().default("private"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("user_generated_exams_user_idx").on(table.userId),
    index("user_generated_exams_exam_idx").on(table.examId),
    index("user_generated_exams_node_idx").on(table.syllabusNodeId),
  ],
);
