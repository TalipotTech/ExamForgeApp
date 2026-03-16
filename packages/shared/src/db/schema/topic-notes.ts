import {
  pgTable,
  bigserial,
  uuid,
  bigint,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { topicConversations } from "./topic-conversations";

export const topicNotes = pgTable(
  "topic_notes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    conversationId: uuid("conversation_id").references(() => topicConversations.id),
    syllabusId: bigint("syllabus_id", { mode: "number" }).notNull(),
    syllabusNodeId: bigint("syllabus_node_id", { mode: "number" }).notNull(),
    tutorialFileId: bigint("tutorial_file_id", { mode: "number" }),
    keyword: varchar("keyword", { length: 200 }),
    noteContent: text("note_content").notNull(),
    noteHtml: text("note_html"),
    isPublic: boolean("is_public").default(false),
    upvotes: integer("upvotes").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_topic_notes_syllabus_node").on(table.syllabusNodeId),
    index("idx_topic_notes_user_node").on(table.userId, table.syllabusNodeId),
  ],
);
