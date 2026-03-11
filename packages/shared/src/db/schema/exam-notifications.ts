import { pgTable, uuid, varchar, timestamp, text, boolean, index } from "drizzle-orm/pg-core";
import { exams } from "./exams";

export const examNotifications = pgTable(
  "exam_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    examId: uuid("exam_id")
      .references(() => exams.id, { onDelete: "cascade" })
      .notNull(),
    type: varchar("type", { length: 30 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    sourceUrl: varchar("source_url", { length: 1000 }),
    isRead: boolean("is_read").default(false),
    isImportant: boolean("is_important").default(false),
    detectedAt: timestamp("detected_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("exam_notifications_exam_id_idx").on(table.examId),
    index("exam_notifications_type_idx").on(table.type),
  ],
);
