import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
  index,
  bigint,
  boolean,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { exams } from "./exams";

export const topicConversations = pgTable(
  "topic_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    examId: uuid("exam_id").references(() => exams.id),
    contextType: varchar("context_type", { length: 20 }).notNull(),
    contextId: uuid("context_id"),
    contextTitle: varchar("context_title", { length: 500 }),
    messages: jsonb("messages")
      .$type<{ role: "user" | "assistant"; content: string; timestamp: string }[]>()
      .notNull()
      .default([]),
    messageCount: integer("message_count").notNull().default(0),
    aiProvider: varchar("ai_provider", { length: 50 }),
    totalTokens: integer("total_tokens").notNull().default(0),
    syllabusId: bigint("syllabus_id", { mode: "number" }),
    syllabusNodeId: bigint("syllabus_node_id", { mode: "number" }),
    tutorialFileId: bigint("tutorial_file_id", { mode: "number" }),
    keyword: varchar("keyword", { length: 200 }),
    savedAsNote: boolean("saved_as_note").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_topic_conv_user").on(table.userId),
    index("idx_topic_conv_context").on(table.contextType, table.contextId),
    index("idx_topic_conv_syllabus_node").on(table.syllabusNodeId),
  ],
);
