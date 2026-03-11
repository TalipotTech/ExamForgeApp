import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  real,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { scrapeSources } from "./scrape-sources";

export const scrapeRuns = pgTable(
  "scrape_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .references(() => scrapeSources.id, { onDelete: "cascade" })
      .notNull(),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    pagesVisited: integer("pages_visited").default(0),
    pagesFailed: integer("pages_failed").default(0),
    questionsFound: integer("questions_found").default(0),
    questionsNew: integer("questions_new").default(0),
    questionsDuplicate: integer("questions_duplicate").default(0),
    aiProvider: varchar("ai_provider", { length: 50 }),
    aiTokensUsed: integer("ai_tokens_used").default(0),
    aiCostUsd: real("ai_cost_usd").default(0),
    errorLog: jsonb("error_log")
      .$type<Array<{ time: string; message: string; page?: string }>>()
      .default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("scrape_runs_source_id_idx").on(table.sourceId),
    index("scrape_runs_status_idx").on(table.status),
  ],
);
