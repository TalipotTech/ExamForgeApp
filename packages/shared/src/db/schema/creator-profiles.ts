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
import { users } from "./users";

export type CreatorKycDetails = {
  documentType?: string;
  documentNumber?: string;
  verifiedAt?: string;
  verifiedBy?: string;
};

export type CreatorBankDetails = {
  accountNumber?: string;
  ifsc?: string;
  accountName?: string;
  encrypted?: boolean;
};

export type CreatorSocialLinks = {
  twitter?: string;
  instagram?: string;
  linkedin?: string;
  telegram?: string;
};

export const creatorProfiles = pgTable(
  "creator_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),

    displayName: varchar("display_name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 280 }).unique(),
    bio: text("bio"),
    avatarUrl: varchar("avatar_url", { length: 1000 }),
    coverImageUrl: varchar("cover_image_url", { length: 1000 }),
    institution: varchar("institution", { length: 255 }),
    institutionType: varchar("institution_type", { length: 30 }),
    qualification: varchar("qualification", { length: 255 }),

    specializations: jsonb("specializations").$type<string[]>().default([]),
    examsCovered: jsonb("exams_covered").$type<string[]>().default([]),

    verificationStatus: varchar("verification_status", { length: 20 })
      .notNull()
      .default("unverified"),
    kycStatus: varchar("kyc_status", { length: 20 }).default("pending"),
    kycDetails: jsonb("kyc_details").$type<CreatorKycDetails>().default({}),

    creatorTier: varchar("creator_tier", { length: 20 }).notNull().default("free"),
    creatorPlanExpiresAt: timestamp("creator_plan_expires_at"),

    payoutUpi: varchar("payout_upi", { length: 100 }),
    payoutBank: jsonb("payout_bank").$type<CreatorBankDetails>(),
    panNumber: varchar("pan_number", { length: 10 }),
    gstNumber: varchar("gst_number", { length: 15 }),

    followerCount: integer("follower_count").default(0),
    contentCount: integer("content_count").default(0),
    totalViews: integer("total_views").default(0),
    totalStudents: integer("total_students").default(0),
    totalSales: integer("total_sales").default(0),
    totalRevenueEarned: integer("total_revenue_earned").default(0),
    averageRating: real("average_rating").default(0),
    totalRatings: integer("total_ratings").default(0),

    websiteUrl: varchar("website_url", { length: 500 }),
    youtubeUrl: varchar("youtube_url", { length: 500 }),
    socialLinks: jsonb("social_links").$type<CreatorSocialLinks>().default({}),

    promotionalBannerUrl: varchar("promotional_banner_url", { length: 1000 }),
    promotionalText: text("promotional_text"),
    isPromoted: boolean("is_promoted").default(false),
    promotedUntil: timestamp("promoted_until"),

    isFeatured: boolean("is_featured").default(false),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("creator_profiles_user_idx").on(table.userId),
    index("creator_profiles_tier_idx").on(table.creatorTier),
    index("creator_profiles_verification_idx").on(table.verificationStatus),
    index("creator_profiles_featured_idx").on(table.isFeatured),
  ],
);
