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
import { creatorProfiles } from "./creator-profiles";
import { exams } from "./exams";

export type ClassroomSettings = {
  allowDoubts?: boolean;
  requireApproval?: boolean;
  showLeaderboard?: boolean;
  autoAssignContent?: boolean;
};

export type ClassroomSchedule = {
  days?: string[];
  time?: string;
  timezone?: string;
};

export const classrooms = pgTable(
  "classrooms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id),

    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),

    examId: uuid("exam_id").references(() => exams.id),
    subject: varchar("subject", { length: 255 }),

    joinCode: varchar("join_code", { length: 10 }).notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    maxStudents: integer("max_students").notNull().default(100),
    studentCount: integer("student_count").notNull().default(0),

    isPaid: boolean("is_paid").default(false),
    feeInr: integer("fee_inr"),
    billingCycle: varchar("billing_cycle", { length: 10 }),

    settings: jsonb("settings").$type<ClassroomSettings>().default({}),
    academicYear: varchar("academic_year", { length: 10 }),

    schedule: jsonb("schedule").$type<ClassroomSchedule>().default({}),
    nextLiveSession: timestamp("next_live_session"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("classrooms_teacher_idx").on(table.teacherId),
    index("classrooms_creator_idx").on(table.creatorId),
    index("classrooms_exam_idx").on(table.examId),
    index("classrooms_join_code_idx").on(table.joinCode),
  ],
);
