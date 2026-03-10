import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { exams } from "./exams";
import { organizations } from "./organizations";

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
  config: jsonb("config").$type<Record<string, unknown>>().default({}),
  examId: uuid("exam_id").references(() => exams.id),
  orgId: uuid("org_id").references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
