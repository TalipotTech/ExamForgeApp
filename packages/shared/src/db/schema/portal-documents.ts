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
import { exams } from "./exams";

export const portalDocuments = pgTable(
  "portal_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Source tracking
    portalName: varchar("portal_name", { length: 255 }).notNull(),
    portalUrl: varchar("portal_url", { length: 2000 }).notNull(),
    sourcePageType: varchar("source_page_type", { length: 30 }).notNull(),

    // Pagination tracking
    sourcePageNumber: integer("source_page_number"),

    // Document info
    documentType: varchar("document_type", { length: 30 }).notNull(),
    title: varchar("title", { length: 1000 }).notNull(),
    examName: varchar("exam_name", { length: 500 }),
    examYear: integer("exam_year"),
    examCategory: varchar("exam_category", { length: 255 }),

    // File storage
    originalUrl: varchar("original_url", { length: 2000 }).notNull(),
    fileKey: varchar("file_key", { length: 500 }),
    fileUrl: varchar("file_url", { length: 1000 }),
    fileSizeBytes: integer("file_size_bytes"),
    pageCount: integer("page_count"),

    // Processing
    processingStatus: varchar("processing_status", { length: 20 }).notNull().default("discovered"),
    rawText: text("raw_text"),
    extractionMethod: varchar("extraction_method", { length: 50 }),

    // Results
    questionsExtracted: integer("questions_extracted").default(0),
    answersMatched: integer("answers_matched").default(0),
    examId: uuid("exam_id").references(() => exams.id),
    syllabusId: uuid("syllabus_id"),

    // Metadata
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_portal_docs_portal").on(table.portalName),
    index("idx_portal_docs_type").on(table.documentType),
    index("idx_portal_docs_exam").on(table.examId),
    index("idx_portal_docs_status").on(table.processingStatus),
  ],
);
