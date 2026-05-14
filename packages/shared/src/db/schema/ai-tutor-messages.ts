import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { aiTutorConversations } from "./ai-tutor-conversations";

export type AiTutorCitation = {
  contentId: string;
  contentTitle: string;
  chunkIndex: number;
  snippet: string;
  similarity: number;
};

export const aiTutorMessages = pgTable(
  "ai_tutor_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiTutorConversations.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<AiTutorCitation[]>().default([]),
    tokensUsed: integer("tokens_used").notNull().default(0),
    cached: boolean("cached").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_tutor_msgs_conv_idx").on(table.conversationId, table.createdAt),
  ],
);
