import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { creatorProfiles } from "./creator-profiles";
import { classrooms } from "./classrooms";
import { exams } from "./exams";
import { fileUploads } from "./file-uploads";

export const liveSessions = pgTable(
  "live_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id),
    classroomId: uuid("classroom_id").references(() => classrooms.id),

    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),

    scheduledAt: timestamp("scheduled_at").notNull(),
    durationMinutes: integer("duration_minutes").default(60),
    status: varchar("status", { length: 20 }).notNull().default("scheduled"),

    meetingType: varchar("meeting_type", { length: 20 }).notNull().default("embedded"),
    meetingUrl: text("meeting_url"),
    meetingId: varchar("meeting_id", { length: 100 }),

    isRecorded: boolean("is_recorded").default(false),
    recordingUrl: text("recording_url"),
    recordingUploadId: uuid("recording_upload_id").references(() => fileUploads.id),

    examId: uuid("exam_id").references(() => exams.id),
    subject: varchar("subject", { length: 255 }),
    topic: varchar("topic", { length: 255 }),

    maxAttendees: integer("max_attendees").default(0),
    peakConcurrent: integer("peak_concurrent").default(0),
    totalWatchMinutes: integer("total_watch_minutes").default(0),

    isFree: boolean("is_free").default(true),
    priceInr: integer("price_inr"),

    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("live_sessions_creator_idx").on(table.creatorId),
    index("live_sessions_classroom_idx").on(table.classroomId),
    index("live_sessions_scheduled_idx").on(table.scheduledAt),
    index("live_sessions_status_idx").on(table.status),
  ],
);
