import { pgTable, uuid, varchar, integer, real, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { voiceSessions } from "./voice-sessions";

export const ttsUsageLogs = pgTable(
  "tts_usage_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    provider: varchar("provider", { length: 30 }).notNull(),
    voiceId: varchar("voice_id", { length: 100 }).notNull(),
    charCount: integer("char_count").notNull(),
    estimatedCostUsd: real("estimated_cost_usd").default(0),
    sessionId: uuid("session_id").references(() => voiceSessions.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_tts_usage_user_month").on(table.userId, table.provider, table.createdAt)],
);
