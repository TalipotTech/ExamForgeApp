import { pgTable, uuid, varchar, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { marketplaceListings } from "./marketplace-listings";
import { users } from "./users";
import { creatorProfiles } from "./creator-profiles";
import { paymentOrders } from "./payment-orders";

export const marketplacePurchases = pgTable(
  "marketplace_purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListings.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id),

    amountInr: integer("amount_inr").notNull(),
    platformFeeInr: integer("platform_fee_inr").notNull(),
    creatorEarningInr: integer("creator_earning_inr").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),

    paymentOrderId: uuid("payment_order_id").references(() => paymentOrders.id),
    status: varchar("status", { length: 20 }).notNull().default("pending"),

    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    purchasedAt: timestamp("purchased_at"),
    refundedAt: timestamp("refunded_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("marketplace_purchases_listing_idx").on(table.listingId),
    index("marketplace_purchases_buyer_idx").on(table.buyerId),
    index("marketplace_purchases_creator_idx").on(table.creatorId),
    index("marketplace_purchases_status_idx").on(table.status),
  ],
);
