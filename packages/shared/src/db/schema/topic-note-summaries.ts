import {
  pgTable,
  bigserial,
  bigint,
  uuid,
  text,
  integer,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";

export const topicNoteSummaries = pgTable(
  "topic_note_summaries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    syllabusNodeId: bigint("syllabus_node_id", { mode: "number" }).notNull(),
    syllabusId: bigint("syllabus_id", { mode: "number" }).notNull(),
    examId: uuid("exam_id"),
    summaryText: text("summary_text").notNull(),
    summaryHtml: text("summary_html"),
    noteCount: integer("note_count").notNull().default(0),
    lastGeneratedAt: timestamp("last_generated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("topic_note_summaries_node_unique").on(table.syllabusNodeId),
    index("idx_topic_note_summaries_syllabus").on(table.syllabusId),
  ],
);
