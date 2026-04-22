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
import { fileUploads } from "./file-uploads";
import { exams } from "./exams";
import { syllabi } from "./syllabi";
import { syllabusNodes } from "./syllabus-nodes";

export const creatorContent = pgTable(
  "creator_content",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),

    contentType: varchar("content_type", { length: 30 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    body: text("body"),
    slug: varchar("slug", { length: 600 }).unique(),

    fileUploadId: uuid("file_upload_id").references(() => fileUploads.id),
    originalFileName: varchar("original_file_name", { length: 500 }),
    originalFileType: varchar("original_file_type", { length: 100 }),
    originalFileSizeBytes: integer("original_file_size_bytes"),

    mediaUrl: text("media_url"),
    processedUrl: text("processed_url"),
    thumbnailUrl: text("thumbnail_url"),
    durationSeconds: integer("duration_seconds"),

    examId: uuid("exam_id").references(() => exams.id),
    syllabusId: uuid("syllabus_id").references(() => syllabi.id),
    syllabusNodeId: uuid("syllabus_node_id").references(() => syllabusNodes.id),
    subject: varchar("subject", { length: 255 }),
    topic: varchar("topic", { length: 255 }),

    isPremium: boolean("is_premium").notNull().default(false),
    priceInr: integer("price_inr"),
    isPromotional: boolean("is_promotional").default(false),
    promotionalExpiresAt: timestamp("promotional_expires_at"),

    aiSummary: text("ai_summary"),
    aiTags: jsonb("ai_tags").$type<string[]>().default([]),
    aiTranscript: text("ai_transcript"),
    aiQualityScore: real("ai_quality_score"),
    aiLanguage: varchar("ai_language", { length: 10 }),
    uploadStatus: varchar("upload_status", { length: 20 }).notNull().default("pending"),

    verificationStatus: varchar("verification_status", { length: 20 }).default("unverified"),
    verificationScore: real("verification_score"),
    reviewStatus: varchar("review_status", { length: 20 }).notNull().default("pending"),
    reviewNotes: text("review_notes"),

    viewCount: integer("view_count").default(0),
    likeCount: integer("like_count").default(0),
    shareCount: integer("share_count").default(0),
    doubtCount: integer("doubt_count").default(0),
    totalWatchMinutes: integer("total_watch_minutes").default(0),
    avgRating: real("avg_rating").default(0),

    assignedClassrooms: jsonb("assigned_classrooms").$type<string[]>().default([]),

    isPublished: boolean("is_published").notNull().default(false),
    publishedAt: timestamp("published_at"),
    language: varchar("language", { length: 10 }).notNull().default("en"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("creator_content_creator_idx").on(table.creatorId),
    index("creator_content_type_idx").on(table.contentType),
    index("creator_content_exam_idx").on(table.examId),
    index("creator_content_syllabus_node_idx").on(table.syllabusNodeId),
    index("creator_content_published_idx").on(table.isPublished),
    index("creator_content_review_idx").on(table.reviewStatus),
    index("creator_content_premium_idx").on(table.isPremium),
  ],
);
