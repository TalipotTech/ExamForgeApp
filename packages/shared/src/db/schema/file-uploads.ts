import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export type ProcessedVariants = {
  hls_360p?: string;
  hls_480p?: string;
  hls_720p?: string;
  hls_1080p?: string;
  aac_128k?: string;
  thumbnail?: string;
};

export const fileUploads = pgTable(
  "file_uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    storageKey: varchar("storage_key", { length: 500 }).notNull(),
    originalName: varchar("original_name", { length: 500 }),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    publicUrl: text("public_url"),
    cdnUrl: text("cdn_url"),

    processingStatus: varchar("processing_status", { length: 20 }).default("uploaded"),
    processedVariants: jsonb("processed_variants").$type<ProcessedVariants>().default({}),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("file_uploads_user_idx").on(table.userId),
    index("file_uploads_status_idx").on(table.processingStatus),
  ],
);
