import { pgTable, uuid, integer, real, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { exams } from "./exams";

export const userProgress = pgTable(
  "user_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    examId: uuid("exam_id").references(() => exams.id),
    totalQuestionsAttempted: integer("total_questions_attempted").notNull().default(0),
    totalCorrect: integer("total_correct").notNull().default(0),
    totalExamsTaken: integer("total_exams_taken").notNull().default(0),
    averageScore: real("average_score"),
    streakDays: integer("streak_days").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at"),
    subjectScores: jsonb("subject_scores")
      .$type<Record<string, { attempted: number; correct: number; accuracy: number }>>()
      .default({}),
    weakSubjects: jsonb("weak_subjects").$type<string[]>().default([]),
    strongSubjects: jsonb("strong_subjects").$type<string[]>().default([]),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("idx_user_progress_unique").on(table.userId, table.examId)],
);
