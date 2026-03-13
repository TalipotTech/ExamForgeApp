import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  integer,
  real,
  text,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { contentSearches } from "./content-searches";

export const searchResults = pgTable(
  "search_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    searchId: uuid("search_id")
      .notNull()
      .references(() => contentSearches.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 1000 }).notNull(),
    sourceUrl: varchar("source_url", { length: 2000 }).notNull(),
    sourceName: varchar("source_name", { length: 255 }),
    sourceDomain: varchar("source_domain", { length: 255 }),
    contentType: varchar("content_type", { length: 30 }).notNull(),
    snippet: text("snippet"),
    matchQuality: varchar("match_quality", { length: 10 }).notNull(),
    relevanceScore: real("relevance_score").default(0),
    sourceQuality: varchar("source_quality", { length: 20 }).default("unknown"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    isSaved: boolean("is_saved").default(false),
    isExtracted: boolean("is_extracted").default(false),
    extractionCount: integer("extraction_count").default(0),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("search_results_search_id_idx").on(table.searchId),
    index("search_results_saved_idx")
      .on(table.searchId, table.isSaved)
      .where(sql`${table.isSaved} = true`),
  ],
);
