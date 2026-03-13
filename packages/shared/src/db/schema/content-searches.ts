import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  integer,
  real,
  text,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const contentSearches = pgTable(
  "content_searches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    queryText: text("query_text").notNull(),
    parsedQuery: jsonb("parsed_query").$type<Record<string, unknown>>().notNull(),
    resultsCount: integer("results_count").default(0),
    searchStrategiesUsed: jsonb("search_strategies_used").$type<string[]>().default([]),
    aiProvider: varchar("ai_provider", { length: 50 }),
    aiTokensUsed: integer("ai_tokens_used").default(0),
    aiCostUsd: real("ai_cost_usd").default(0),
    cacheKey: varchar("cache_key", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("content_searches_user_id_idx").on(table.userId),
    index("content_searches_cache_key_idx").on(table.cacheKey),
  ],
);
