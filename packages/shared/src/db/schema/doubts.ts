import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { creatorContent } from "./creator-content";
import { syllabusNodes } from "./syllabus-nodes";
import { classrooms } from "./classrooms";

export type DoubtImage = {
  url: string;
  caption?: string;
};

export const doubts = pgTable(
  "doubts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id").references(() => users.id),
    contentId: uuid("content_id").references(() => creatorContent.id),
    syllabusNodeId: uuid("syllabus_node_id").references(() => syllabusNodes.id),
    classroomId: uuid("classroom_id").references(() => classrooms.id),

    questionText: text("question_text").notNull(),
    questionImages: jsonb("question_images").$type<DoubtImage[]>().default([]),

    status: varchar("status", { length: 20 }).notNull().default("open"),
    upvoteCount: integer("upvote_count").default(0),
    isPublic: boolean("is_public").default(true),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("doubts_student_idx").on(table.studentId),
    index("doubts_creator_idx").on(table.creatorId),
    index("doubts_content_idx").on(table.contentId),
    index("doubts_classroom_idx").on(table.classroomId),
    index("doubts_status_idx").on(table.status),
  ],
);
