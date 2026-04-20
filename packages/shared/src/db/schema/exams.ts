import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  boolean,
  integer,
  text,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export type ExamPattern = {
  marks?: number;
  duration?: number;
  negative?: boolean;
  sections?: Array<{ name: string; questions: number; marks: number }>;
};

export const exams = pgTable(
  "exams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    subjects: jsonb("subjects").$type<string[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    // Discovery & listing columns
    status: varchar("status", { length: 20 }).default("active"),
    examDate: timestamp("exam_date"),
    registrationStart: timestamp("registration_start"),
    registrationEnd: timestamp("registration_end"),
    resultDate: timestamp("result_date"),
    officialUrl: varchar("official_url", { length: 1000 }),
    applicationUrl: varchar("application_url", { length: 1000 }),
    syllabusUrl: varchar("syllabus_url", { length: 1000 }),
    conductingBody: varchar("conducting_body", { length: 255 }),
    level: varchar("level", { length: 20 }).default("national"),
    eligibility: text("eligibility"),
    totalMarks: integer("total_marks"),
    durationMinutes: integer("duration_minutes"),
    negativeMarking: boolean("negative_marking").default(false),
    negativeMarkingScheme: varchar("negative_marking_scheme", { length: 100 }),
    examPattern: jsonb("exam_pattern").$type<ExamPattern>().default({}),
    tags: jsonb("tags").$type<string[]>().default([]),
    questionCount: integer("question_count").default(0),
    isFeatured: boolean("is_featured").default(false),
    isAutoDiscovered: boolean("is_auto_discovered").default(false),
    discoverySource: varchar("discovery_source", { length: 255 }),
    dateConfidence: varchar("date_confidence", { length: 20 }),
    lastCheckedAt: timestamp("last_checked_at"),
    popularityScore: integer("popularity_score").default(0),

    // Universal Discovery v2 — content acquisition tracking (JSONB):
    // previousPapersFound, syllabusFound, patternGenerated,
    // missingPaperYears, completenessScore, etc.
    // Schema: ExamContentCompleteness in validators/discovery.ts.
    contentCompleteness: jsonb("content_completeness").$type<Record<string, unknown>>().default({}),

    orgId: uuid("org_id").references(() => organizations.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("exams_status_idx").on(table.status),
    index("exams_exam_date_idx").on(table.examDate),
    index("exams_conducting_body_idx").on(table.conductingBody),
    index("exams_is_featured_idx").on(table.isFeatured),
  ],
);
