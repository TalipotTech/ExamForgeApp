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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("syllabus_nodes_syllabus_idx").on(table.syllabusId),
    index("syllabus_nodes_parent_idx").on(table.parentId),
    index("syllabus_nodes_type_idx").on(table.nodeType),
  ],
);
