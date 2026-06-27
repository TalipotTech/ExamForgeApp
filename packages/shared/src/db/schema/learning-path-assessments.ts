import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { exams } from "./exams";

export type LearningPathStrength = {
  nodeId: number;
  title: string;
  reason: string;
};

export type LearningPathImprovement = {
  nodeId: number;
  title: string;
  reason: string;
  priority: "high" | "medium" | "low";
  suggestedAction: string;
  tutorialId?: number;
  syllabusId?: number;
};

/**
 * Cached AI self-assessment snapshots. Regenerated at most once per
 * (user, exam, subject) per LEARNING_PATH_TTL_HOURS — the overall score and
 * ranking are always computed deterministically; AI only phrases the prose.
 */
export const learningPathAssessments = pgTable(
  "learning_path_assessments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id"),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    // nullable = whole-exam assessment
    subject: varchar("subject", { length: 255 }),
    signalsJson: jsonb("signals_json").$type<Record<string, unknown>>().notNull().default({}),
    summary: text("summary"),
    strengthsJson: jsonb("strengths_json").$type<LearningPathStrength[]>().default([]),
    improvementsJson: jsonb("improvements_json").$type<LearningPathImprovement[]>().default([]),
    // 0-100, computed deterministically
    overallScore: numeric("overall_score", { precision: 4, scale: 2 }),
    generationModel: varchar("generation_model", { length: 50 }),
    generationCost: numeric("generation_cost", { precision: 8, scale: 4 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("learning_path_assessments_lookup_idx").on(
      table.userId,
      table.examId,
      table.subject,
      table.createdAt.desc(),
    ),
  ],
);
