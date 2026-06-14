import {
  pgTable,
  uuid,
  varchar,
  text,
  real,
  integer,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { classroomAssignments } from "./classroom-assignments";
import { users } from "./users";
import { examSessions } from "./exam-sessions";

export const assignmentSubmissions = pgTable(
  "assignment_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => classroomAssignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),

    status: varchar("status", { length: 20 }).notNull().default("pending"),
    score: real("score"),
    timeSpentSeconds: integer("time_spent_seconds"),
    submittedAt: timestamp("submitted_at"),

    examSessionId: uuid("exam_session_id").references(() => examSessions.id),

    submissionText: text("submission_text"),
    submissionUrl: text("submission_url"),
    submissionFileName: varchar("submission_file_name", { length: 500 }),
    submissionMimeType: varchar("submission_mime_type", { length: 100 }),

    feedback: text("feedback"),
    gradedBy: uuid("graded_by").references(() => users.id),
    gradedAt: timestamp("graded_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("assignment_submissions_assignment_student_unique").on(
      table.assignmentId,
      table.studentId,
    ),
    index("assignment_submissions_assignment_idx").on(table.assignmentId),
    index("assignment_submissions_student_idx").on(table.studentId),
    index("assignment_submissions_status_idx").on(table.status),
  ],
);
