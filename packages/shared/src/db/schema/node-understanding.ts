import { pgTable, uuid, bigint, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { exams } from "./exams";
import { syllabusNodes } from "./syllabus-nodes";

/**
 * Per-(user, syllabus_node) self-rated understanding — the ExamForge analog
 * of Padvik's `topic_understanding`. A traffic-light signal the student sets
 * from the tutorial reader; feeds the learning-path ranking.
 *
 * PK discipline: UUID PK; user/exam FKs are UUID, the tree FK is bigint.
 */
export const nodeUnderstanding = pgTable(
  "node_understanding",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id"),
    examId: uuid("exam_id").references(() => exams.id, { onDelete: "set null" }),
    syllabusNodeId: bigint("syllabus_node_id", { mode: "number" })
      .notNull()
      .references(() => syllabusNodes.id, { onDelete: "cascade" }),
    // 'red' | 'orange' | 'green'
    level: varchar("level", { length: 10 }).notNull().default("green"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("node_understanding_user_node_idx").on(table.userId, table.syllabusNodeId),
    index("node_understanding_user_idx").on(table.userId),
    index("node_understanding_node_idx").on(table.syllabusNodeId),
  ],
);
