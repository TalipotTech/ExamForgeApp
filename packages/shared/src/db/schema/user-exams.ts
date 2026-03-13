import { pgTable, uuid, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { exams } from "./exams";

export const userExams = pgTable(
  "user_exams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),
    targetScore: integer("target_score"),
    priority: integer("priority").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("idx_user_exams_unique").on(table.userId, table.examId)],
);
