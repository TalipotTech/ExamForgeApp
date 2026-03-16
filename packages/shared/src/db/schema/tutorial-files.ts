import {
  pgTable,
  bigserial,
  bigint,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  real,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Types ───

export type TutorialFileSection = {
  id: string;
  title: string;
  htmlContent: string;
  plainText: string;
  order: number;
};
import { syllabusNodes } from "./syllabus-nodes";
import { syllabi } from "./syllabi";
import { exams } from "./exams";

export const tutorialFiles = pgTable(
  "tutorial_files",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    syllabusNodeId: bigint("syllabus_node_id", { mode: "number" })
      .notNull()
      .references(() => syllabusNodes.id, { onDelete: "cascade" }),
    syllabusId: bigint("syllabus_id", { mode: "number" })
      .notNull()
      .references(() => syllabi.id, { onDelete: "cascade" }),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),

    // File storage
    fileKey: varchar("file_key", { length: 500 }).notNull(),
    fileUrl: varchar("file_url", { length: 1000 }),
    previewFileKey: varchar("preview_file_key", { length: 500 }),
    previewFileUrl: varchar("preview_file_url", { length: 1000 }),
    fileSizeBytes: integer("file_size_bytes"),

    // Parsed content (extracted from HTML for reader)
    sections: jsonb("sections").$type<TutorialFileSection[]>(),
    plainText: text("plain_text"),

    // Content metadata
    title: varchar("title", { length: 500 }).notNull(),
    wordCount: integer("word_count"),
    estimatedReadMinutes: integer("estimated_read_minutes"),
    sectionsCount: integer("sections_count"),
    hasDiagrams: boolean("has_diagrams").default(false),
    hasFormulas: boolean("has_formulas").default(false),
    hasTables: boolean("has_tables").default(false),
    hasMnemonics: boolean("has_mnemonics").default(false),
    keyTerms: jsonb("key_terms").$type<string[]>().default([]),
    referenceLinks: jsonb("reference_links")
      .$type<Array<{ title: string; url: string; source: string }>>()
      .default([]),

    // Generation info
    version: integer("version").notNull().default(1),
    isCurrent: boolean("is_current").default(true),
    generatedBy: varchar("generated_by", { length: 50 }).notNull(),
    aiProvidersUsed: jsonb("ai_providers_used").$type<string[]>().default([]),
    aiTokensUsed: integer("ai_tokens_used").default(0),
    aiCostUsd: real("ai_cost_usd").default(0),
    generationConfig: jsonb("generation_config").$type<Record<string, unknown>>().default({}),

    // Access tracking
    isFreePreview: boolean("is_free_preview").default(false),
    freePreviewPercentage: integer("free_preview_percentage").default(30),
    totalViews: integer("total_views").default(0),
    uniqueViewers: integer("unique_viewers").default(0),

    // Ownership
    ownerType: varchar("owner_type", { length: 10 }).notNull().default("platform"),
    visibility: varchar("visibility", { length: 20 }).notNull().default("public"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("tutorial_files_node_idx")
      .on(table.syllabusNodeId)
      .where(sql`${table.isCurrent} = true`),
    index("tutorial_files_syllabus_idx").on(table.syllabusId),
    index("tutorial_files_exam_idx").on(table.examId),
  ],
);
