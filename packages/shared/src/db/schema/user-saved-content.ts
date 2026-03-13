import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  integer,
  text,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { searchResults } from "./search-results";
import { exams } from "./exams";

export const userSavedContent = pgTable(
  "user_saved_content",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    searchResultId: uuid("search_result_id").references(() => searchResults.id),
    title: varchar("title", { length: 1000 }).notNull(),
    sourceUrl: varchar("source_url", { length: 2000 }),
    sourceName: varchar("source_name", { length: 255 }),
    contentType: varchar("content_type", { length: 30 }).notNull(),
    savedType: varchar("saved_type", { length: 20 }).notNull(),
    fileKey: varchar("file_key", { length: 500 }),
    fileUrl: varchar("file_url", { length: 1000 }),
    rawText: text("raw_text"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    examId: uuid("exam_id").references(() => exams.id),
    tags: jsonb("tags").$type<string[]>().default([]),
    questionsExtracted: integer("questions_extracted").default(0),
    ownerType: varchar("owner_type", { length: 10 }).default("user"),
    ownerId: uuid("owner_id").references(() => users.id),
    visibility: varchar("visibility", { length: 20 }).default("private"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("user_saved_content_user_id_idx").on(table.userId),
    index("user_saved_content_exam_id_idx").on(table.examId),
    index("user_saved_content_user_type_idx").on(table.userId, table.contentType),
  ],
);
