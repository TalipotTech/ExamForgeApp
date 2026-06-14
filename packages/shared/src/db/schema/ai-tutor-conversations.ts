import {
  pgTable,
  uuid,
  varchar,
  integer,
  real,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { classrooms } from "./classrooms";

export const aiTutorConversations = pgTable(
  "ai_tutor_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    messageCount: integer("message_count").notNull().default(0),
    totalInputTokens: integer("total_input_tokens").notNull().default(0),
    totalOutputTokens: integer("total_output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    estimatedCostUsd: real("estimated_cost_usd").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_tutor_conv_user_idx").on(table.userId),
    index("ai_tutor_conv_classroom_idx").on(table.classroomId),
    index("ai_tutor_conv_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);
