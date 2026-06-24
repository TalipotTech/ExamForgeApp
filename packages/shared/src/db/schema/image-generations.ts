import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  real,
  smallint,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { syllabusNodes } from "./syllabus-nodes";

// AI Image Generation tracking — one row per generated image.
// Shared across platforms (examforge | padvik). Populated by the image
// router (apps/api/src/ai/image-router.ts). See
// docs/features/ai-image-gen/AI_IMAGE_GENERATION.md §6.
export const imageGenerations = pgTable(
  "image_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: varchar("platform", { length: 20 }).notNull(), // examforge | padvik
    purpose: varchar("purpose", { length: 50 }).notNull(),
    model: varchar("model", { length: 50 }).notNull(),

    prompt: text("prompt").notNull(),
    enhancedPrompt: text("enhanced_prompt"),
    negativePrompt: text("negative_prompt"),

    s3Key: varchar("s3_key", { length: 500 }).notNull(),
    cdnUrl: varchar("cdn_url", { length: 1000 }),
    width: integer("width"),
    height: integer("height"),

    costUsd: real("cost_usd").notNull(),
    generationTimeMs: integer("generation_time_ms"),

    userId: uuid("user_id").references(() => users.id),
    contentId: uuid("content_id"),
    contentType: varchar("content_type", { length: 50 }),
    // Topic linkage. syllabus_nodes.id is bigint (not uuid), so it can't use
    // content_id (uuid) — this dedicated column joins topic images cleanly.
    syllabusNodeId: bigint("syllabus_node_id", { mode: "number" }).references(
      () => syllabusNodes.id,
      { onDelete: "set null" },
    ),

    wasFallback: boolean("was_fallback").default(false),
    fallbackModel: varchar("fallback_model", { length: 50 }),
    userRating: smallint("user_rating"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    platformIdx: index("idx_image_gen_platform").on(table.platform),
    purposeIdx: index("idx_image_gen_purpose").on(table.purpose),
    contentIdx: index("idx_image_gen_content").on(table.contentId),
    syllabusNodeIdx: index("idx_image_gen_syllabus_node").on(table.syllabusNodeId),
  }),
);
