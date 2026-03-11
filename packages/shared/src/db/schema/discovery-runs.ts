import { pgTable, uuid, varchar, timestamp, integer, real, jsonb } from "drizzle-orm/pg-core";

export const discoveryRuns = pgTable("discovery_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentType: varchar("agent_type", { length: 30 }).notNull(),
  portalsChecked: jsonb("portals_checked").$type<string[]>().notNull(),
  examsFound: integer("exams_found").default(0),
  examsNew: integer("exams_new").default(0),
  examsUpdated: integer("exams_updated").default(0),
  notificationsCreated: integer("notifications_created").default(0),
  aiProvider: varchar("ai_provider", { length: 50 }),
  crawlerType: varchar("crawler_type", { length: 20 }),
  maxPagesPerPortal: integer("max_pages_per_portal"),
  aiTokensUsed: integer("ai_tokens_used").default(0),
  aiCostUsd: real("ai_cost_usd").default(0),
  status: varchar("status", { length: 20 }).notNull().default("running"),
  errorLog: jsonb("error_log").$type<Array<{ time: string; message: string }>>().default([]),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
