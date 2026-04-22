import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { creatorProfiles } from "./creator-profiles";
import { marketplacePurchases } from "./marketplace-purchases";

export const creatorEarnings = pgTable(
  "creator_earnings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),

    earningType: varchar("earning_type", { length: 30 }).notNull(),
    amountInr: integer("amount_inr").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),

    sourcePurchaseId: uuid("source_purchase_id").references(() => marketplacePurchases.id),
    sourceType: varchar("source_type", { length: 30 }),
    sourceId: uuid("source_id"),

    status: varchar("status", { length: 20 }).notNull().default("pending"),
    availableAt: timestamp("available_at"),
    paidOutAt: timestamp("paid_out_at"),
    payoutReference: varchar("payout_reference", { length: 100 }),

    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("creator_earnings_creator_idx").on(table.creatorId),
    index("creator_earnings_status_idx").on(table.status),
    index("creator_earnings_type_idx").on(table.earningType),
  ],
);
