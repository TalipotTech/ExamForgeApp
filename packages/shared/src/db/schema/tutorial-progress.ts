import {
  pgTable,
  bigserial,
  bigint,
  uuid,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { tutorialFiles } from "./tutorial-files";
import { syllabi } from "./syllabi";
import { syllabusNodes } from "./syllabus-nodes";

export const tutorialProgress = pgTable(
  "tutorial_progress",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tutorialFileId: bigint("tutorial_file_id", { mode: "number" })
      .notNull()
      .references(() => tutorialFiles.id, { onDelete: "cascade" }),
    syllabusId: bigint("syllabus_id", { mode: "number" })
      .notNull()
      .references(() => syllabi.id, { onDelete: "cascade" }),
    syllabusNodeId: bigint("syllabus_node_id", { mode: "number" })
      .notNull()
      .references(() => syllabusNodes.id, { onDelete: "cascade" }),

    // Progress tracking
    sectionsRead: jsonb("sections_read").$type<string[]>().default([]),
    completionPercent: integer("completion_percent").notNull().default(0),
    lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
    totalReadTimeSeconds: integer("total_read_time_seconds").notNull().default(0),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tutorial_progress_user_file_idx").on(table.userId, table.tutorialFileId),
    index("tutorial_progress_user_syllabus_idx").on(table.userId, table.syllabusId),
  ],
);
