import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  real,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { exams } from "./exams";

export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  examId: uuid("exam_id").references(() => exams.id),
  provider: varchar("provider", { length: 50 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  feature: varchar("feature", { length: 100 }).notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  estimatedCostUsd: real("estimated_cost_usd").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
