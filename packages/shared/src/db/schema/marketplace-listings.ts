import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  integer,
  real,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { creatorProfiles } from "./creator-profiles";
import { creatorContent } from "./creator-content";
import { exams } from "./exams";

export const marketplaceListings = pgTable(
  "marketplace_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),
    contentId: uuid("content_id").references(() => creatorContent.id),

    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    slug: varchar("slug", { length: 600 }).unique(),
    coverImageUrl: varchar("cover_image_url", { length: 1000 }),

    listingType: varchar("listing_type", { length: 30 }).notNull(),
    priceInr: integer("price_inr").notNull(),
    compareAtPriceInr: integer("compare_at_price_inr"),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),

    examId: uuid("exam_id").references(() => exams.id),
    subject: varchar("subject", { length: 255 }),
    tags: jsonb("tags").$type<string[]>().default([]),

    previewContent: text("preview_content"),
    previewUrl: text("preview_url"),

    isPublished: boolean("is_published").notNull().default(false),
    publishedAt: timestamp("published_at"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),

    purchaseCount: integer("purchase_count").default(0),
    viewCount: integer("view_count").default(0),
    avgRating: real("avg_rating").default(0),
    totalRatings: integer("total_ratings").default(0),

    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("marketplace_listings_creator_idx").on(table.creatorId),
    index("marketplace_listings_exam_idx").on(table.examId),
    index("marketplace_listings_status_idx").on(table.status),
    index("marketplace_listings_published_idx").on(table.isPublished),
  ],
);
