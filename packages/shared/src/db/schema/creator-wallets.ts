import { pgTable, uuid, integer, timestamp, index } from "drizzle-orm/pg-core";
import { creatorProfiles } from "./creator-profiles";

export const creatorWallets = pgTable(
  "creator_wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .unique()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),

    balanceInr: integer("balance_inr").notNull().default(0),
    pendingInr: integer("pending_inr").notNull().default(0),
    lifetimeEarnedInr: integer("lifetime_earned_inr").notNull().default(0),
    lifetimePaidOutInr: integer("lifetime_paid_out_inr").notNull().default(0),

    lastPayoutAt: timestamp("last_payout_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("creator_wallets_creator_idx").on(table.creatorId)],
);
