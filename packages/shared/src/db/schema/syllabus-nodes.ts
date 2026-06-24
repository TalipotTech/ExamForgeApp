import {
  pgTable,
  bigserial,
  bigint,
  varchar,
  timestamp,
  text,
  integer,
  jsonb,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { syllabi } from "./syllabi";

export const syllabusNodes = pgTable(
  "syllabus_nodes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    syllabusId: bigint("syllabus_id", { mode: "number" })
      .notNull()
      .references(() => syllabi.id, { onDelete: "cascade" }),
    parentId: bigint("parent_id", { mode: "number" }).references(
      // Self-referencing FK for adjacency list tree pattern
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (): any => syllabusNodes.id,
      { onDelete: "cascade" },
    ),
    nodeType: varchar("node_type", { length: 20 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    content: text("content"),
    sortOrder: integer("sort_order").notNull().default(0),
    depth: integer("depth").notNull().default(0),
    keyTerms: jsonb("key_terms").$type<string[]>().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    tutorialStatus: varchar("tutorial_status", { length: 20 }).default("none"),
    mcqStatus: varchar("mcq_status", { length: 20 }).default("none"),
    mcqCount: integer("mcq_count").default(0),
    // AI-generated topic image (context-derived). imageContentHash is the
    // hash of the source signal used to generate it, for idempotent sync —
    // unchanged topics are skipped on re-run. See image-sync-worker.ts.
    imageUrl: varchar("image_url", { length: 1000 }),
    imageKey: varchar("image_key", { length: 500 }),
    imageStatus: varchar("image_status", { length: 20 }).default("none"), // none|queued|ready|skipped|error
    imageContentHash: varchar("image_content_hash", { length: 64 }),
    slug: varchar("slug", { length: 200 }),
    publicSummaryAvailable: boolean("public_summary_available").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("syllabus_nodes_syllabus_idx").on(table.syllabusId),
    index("syllabus_nodes_parent_idx").on(table.parentId),
    index("syllabus_nodes_type_idx").on(table.nodeType),
  ],
);
