import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { creatorProfiles } from "./creator-profiles";
import { creatorContent } from "./creator-content";
import { marketplaceListings } from "./marketplace-listings";
import { classrooms } from "./classrooms";
import { users } from "./users";

export const promotions = pgTable(
  "promotions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id),

    promotionType: varchar("promotion_type", { length: 30 }).notNull(),

    contentId: uuid("content_id").references(() => creatorContent.id),
    listingId: uuid("listing_id").references(() => marketplaceListings.id),
    classroomId: uuid("classroom_id").references(() => classrooms.id),

    bannerImageUrl: varchar("banner_image_url", { length: 1000 }),
    headline: varchar("headline", { length: 255 }),
    description: text("description"),
    ctaText: varchar("cta_text", { length: 100 }),
    ctaUrl: varchar("cta_url", { length: 500 }),

    targetExams: jsonb("target_exams").$type<string[]>().default([]),
    targetSubjects: jsonb("target_subjects").$type<string[]>().default([]),

    budgetType: varchar("budget_type", { length: 20 }).notNull(),
    budgetAmountInr: integer("budget_amount_inr"),
    spentAmountInr: integer("spent_amount_inr").default(0),

    impressions: integer("impressions").default(0),
    clicks: integer("clicks").default(0),
    conversions: integer("conversions").default(0),

    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),

    approvedBy: uuid("approved_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("promotions_creator_idx").on(table.creatorId),
    index("promotions_status_idx").on(table.status),
    index("promotions_type_idx").on(table.promotionType),
    index("promotions_window_idx").on(table.startsAt, table.endsAt),
  ],
);
