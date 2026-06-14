import {
  pgTable,
  uuid,
  varchar,
  integer,
  real,
  jsonb,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { creatorProfiles } from "./creator-profiles";

export const subscriptionPool = pgTable(
  "subscription_pool",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),

    periodMonth: varchar("period_month", { length: 7 }).notNull(),

    freeViewCount: integer("free_view_count").notNull().default(0),
    totalWatchMinutes: integer("total_watch_minutes").notNull().default(0),
    weightedScore: real("weighted_score").notNull().default(0),

    poolShareInr: integer("pool_share_inr").notNull().default(0),
    totalPoolInr: integer("total_pool_inr").notNull().default(0),

    status: varchar("status", { length: 20 }).notNull().default("pending"),
    distributedAt: timestamp("distributed_at"),

    breakdown: jsonb("breakdown").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("subscription_pool_creator_period_unique").on(table.creatorId, table.periodMonth),
    index("subscription_pool_creator_idx").on(table.creatorId),
    index("subscription_pool_period_idx").on(table.periodMonth),
    index("subscription_pool_status_idx").on(table.status),
  ],
);
