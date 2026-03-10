import {
  pgTable,
  uuid,
  timestamp,
  jsonb,
  integer,
  real,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { exams } from "./exams";
import { organizations } from "./organizations";

export const examSessions = pgTable("exam_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  examId: uuid("exam_id")
    .notNull()
    .references(() => exams.id),
  questions: jsonb("questions").$type<string[]>().notNull(),
  answers: jsonb("answers").$type<Record<string, number>>().default({}),
  score: real("score"),
  totalQuestions: integer("total_questions").notNull(),
  timeTakenSeconds: integer("time_taken_seconds"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  orgId: uuid("org_id").references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
