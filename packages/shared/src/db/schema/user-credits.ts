import { pgTable, uuid, integer, timestamp, date, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userCredits = pgTable(
  "user_credits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    creditsTotal: integer("credits_total").notNull(),
    creditsUsed: integer("credits_used").notNull().default(0),
    questionsAttempted: integer("questions_attempted").notNull().default(0),
    mockExamsTaken: integer("mock_exams_taken").notNull().default(0),
    aiQuestionsAsked: integer("ai_questions_asked").notNull().default(0),
    tutorialsAccessed: integer("tutorials_accessed").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("idx_user_credits_period").on(table.userId, table.periodStart)],
);
