import {
  pgTable,
  uuid,
  varchar,
  integer,
  real,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 500 }).notNull(),
    messages: jsonb("messages")
      .$type<{ role: "user" | "assistant"; content: string; timestamp: string }[]>()
      .notNull()
      .default([]),
    messageCount: integer("message_count").notNull().default(0),
    aiProvider: varchar("ai_provider", { length: 50 }),
    totalInputTokens: integer("total_input_tokens").notNull().default(0),
    totalOutputTokens: integer("total_output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    estimatedCostUsd: real("estimated_cost_usd").notNull().default(0),
    keyword: varchar("keyword", { length: 200 }),
    pageContext: varchar("page_context", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_ai_conv_user").on(table.userId),
    index("idx_ai_conv_user_updated").on(table.userId, table.updatedAt),
  ],
);
