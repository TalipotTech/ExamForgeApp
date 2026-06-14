import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  real,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { classrooms } from "./classrooms";
import { creatorContent } from "./creator-content";
import { users } from "./users";

export type ExamSessionConfig = {
  questionCount?: number;
  timeLimitMinutes?: number;
  passingScore?: number;
  shuffleQuestions?: boolean;
};

export const classroomAssignments = pgTable(
  "classroom_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),

    assignmentType: varchar("assignment_type", { length: 30 }).notNull(),
    contentId: uuid("content_id").references(() => creatorContent.id),
    examSessionConfig: jsonb("exam_session_config").$type<ExamSessionConfig>(),

    title: varchar("title", { length: 500 }).notNull(),
    instructions: text("instructions"),

    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
    dueAt: timestamp("due_at"),

    attachmentUrl: text("attachment_url"),
    attachmentFileName: varchar("attachment_file_name", { length: 500 }),
    attachmentMimeType: varchar("attachment_mime_type", { length: 100 }),

    totalStudents: integer("total_students").default(0),
    completedCount: integer("completed_count").default(0),
    averageScore: real("average_score"),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("classroom_assignments_classroom_idx").on(table.classroomId),
    index("classroom_assignments_content_idx").on(table.contentId),
    index("classroom_assignments_due_idx").on(table.dueAt),
  ],
);
