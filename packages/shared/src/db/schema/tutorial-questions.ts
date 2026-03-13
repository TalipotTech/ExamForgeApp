import { pgTable, bigserial, bigint, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { tutorials } from "./tutorials";
import { questions } from "./questions";
import { syllabusNodes } from "./syllabus-nodes";

export const tutorialQuestions = pgTable(
  "tutorial_questions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tutorialId: bigint("tutorial_id", { mode: "number" })
      .notNull()
      .references(() => tutorials.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    syllabusNodeId: bigint("syllabus_node_id", { mode: "number" })
      .notNull()
      .references(() => syllabusNodes.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("tutorial_questions_tutorial_idx").on(table.tutorialId),
    index("tutorial_questions_node_idx").on(table.syllabusNodeId),
  ],
);
