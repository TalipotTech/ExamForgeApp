import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  integer,
  text,
  pgEnum,
} from "drizzle-orm/pg-core";
import { exams } from "./exams";
import { organizations } from "./organizations";

export type ScrapeSourceConfig = {
  crawlerType?: "cheerio" | "playwright";
  maxPages?: number;
  fetchDelayMs?: number;
  urlPatterns?: string[];
  excludePatterns?: string[];
  contentSelector?: string;
  schedule?: {
    enabled: boolean;
    cron: string;
  };
  defaultSubject?: string;
  defaultDifficulty?: "easy" | "medium" | "hard";
  questionTypes?: Array<"mcq" | "true_false" | "fill_blank" | "match" | "assertion">;
};

export const scrapeStatusEnum = pgEnum("scrape_status", [
  "pending",
  "active",
  "paused",
  "error",
  "completed",
]);

export const scrapeSources = pgTable("scrape_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  url: varchar("url", { length: 1000 }).notNull(),
  status: scrapeStatusEnum("status").notNull().default("pending"),
  lastScrapedAt: timestamp("last_scraped_at"),
  questionsCount: integer("questions_count").notNull().default(0),
  config: jsonb("config").$type<ScrapeSourceConfig>().default({}),

  // Extended columns
  sourceType: varchar("source_type", { length: 30 }).default("question_bank"),
  scrapeFrequency: varchar("scrape_frequency", { length: 20 }).default("manual"),
  scrapeDepth: integer("scrape_depth").default(1),
  contentFormat: varchar("content_format", { length: 20 }).default("html"),
  aiProvider: varchar("ai_provider", { length: 50 }).default("auto"),
  totalRuns: integer("total_runs").default(0),
  successfulRuns: integer("successful_runs").default(0),
  totalQuestionsScraped: integer("total_questions_scraped").default(0),
  lastError: text("last_error"),
  nextRunAt: timestamp("next_run_at"),
  notes: text("notes"),
  tags: jsonb("tags").$type<string[]>().default([]),

  examId: uuid("exam_id").references(() => exams.id),
  orgId: uuid("org_id").references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
