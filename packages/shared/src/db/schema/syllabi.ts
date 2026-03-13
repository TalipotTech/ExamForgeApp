import {
  pgTable,
  bigserial,
  uuid,
  varchar,
  timestamp,
  text,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { exams } from "./exams";
import { organizations } from "./organizations";
import { users } from "./users";

export const syllabi = pgTable(
  "syllabi",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),
    orgId: uuid("org_id").references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    fileKey: varchar("file_key", { length: 500 }).notNull(),
    fileUrl: varchar("file_url", { length: 1000 }),
    fileSizeBytes: integer("file_size_bytes"),
    mimeType: varchar("mime_type", { length: 100 }).default("application/pdf"),
    status: varchar("status", { length: 20 }).notNull().default("uploading"),
    errorMessage: text("error_message"),
    rawText: text("raw_text"),
    pageCount: integer("page_count"),
    extractionMethod: varchar("extraction_method", { length: 50 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => [
    index("syllabi_exam_id_idx").on(table.examId),
    index("syllabi_status_idx").on(table.status),
  ],
);
