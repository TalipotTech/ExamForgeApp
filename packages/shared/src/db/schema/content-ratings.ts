import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { creatorContent } from "./creator-content";
import { marketplaceListings } from "./marketplace-listings";
import { users } from "./users";

export const contentRatings = pgTable(
  "content_ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentId: uuid("content_id").references(() => creatorContent.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id").references(() => marketplaceListings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    rating: integer("rating").notNull(),
    reviewText: text("review_text"),
    reviewTitle: varchar("review_title", { length: 255 }),

    isVerifiedPurchase: varchar("is_verified_purchase", { length: 5 }).default("false"),
    helpfulCount: integer("helpful_count").default(0),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("content_ratings_content_user_unique").on(table.contentId, table.userId),
    unique("content_ratings_listing_user_unique").on(table.listingId, table.userId),
    index("content_ratings_content_idx").on(table.contentId),
    index("content_ratings_listing_idx").on(table.listingId),
    index("content_ratings_user_idx").on(table.userId),
  ],
);
