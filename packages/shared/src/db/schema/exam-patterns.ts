import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  boolean,
  integer,
  real,
  index,
} from "drizzle-orm/pg-core";
import { exams } from "./exams";
import { users } from "./users";
import { organizations } from "./organizations";

export type SubjectWeightage = {
  subject: string;
  averagePercent: number;
  minPercent: number;
  maxPercent: number;
  questionCount: number;
};

export type TopicFrequency = {
  subject: string;
  topic: string;
  appearsInPercent: number;
  avgQuestionsPerPaper: number;
  importance: "must_study" | "high" | "medium" | "low";
};

export type DifficultyDistribution = {
  easy: number;
  medium: number;
  hard: number;
};

export type StyleDistribution = {
  style: string;
  percent: number;
};

export type RepeatAnalysis = {
  overallRepeatRate: number;
  topRepeatedTopics: string[];
  commonRepeatedQuestions: {
    question: string;
    appearedIn: string[];
  }[];
};

export type LanguagePatterns = {
  negativeQuestionPercent: number;
  allOfAbovePercent: number;
  noneOfAbovePercent: number;
  commonPhrases: string[];
};

export type SectionStructure = {
  name: string;
  questionRange: [number, number];
  subjectFocus: string[];
};

export type ExamFingerprint = {
  examId: string;
  examName: string;
  conductingBody: string;
  papersAnalyzed: number;
  confidence: number;
  structure: {
    totalQuestions: number;
    totalMarks: number;
    durationMinutes: number;
    negativeMarking: boolean;
    negativeScheme: string;
    sections: SectionStructure[];
  };
  subjectWeightage: SubjectWeightage[];
  topicFrequency: TopicFrequency[];
  difficultyDistribution: DifficultyDistribution;
  styleDistribution: StyleDistribution[];
  repeatAnalysis: RepeatAnalysis;
  languagePatterns: LanguagePatterns;
  generatedAt: string;
  paperYearsIncluded: number[];
};

export const examPatterns = pgTable(
  "exam_patterns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),

    // Fingerprint data
    fingerprint: jsonb("fingerprint").$type<ExamFingerprint>().notNull(),
    papersAnalyzed: integer("papers_analyzed").notNull(),
    paperYears: jsonb("paper_years").$type<number[]>().notNull(),
    confidence: real("confidence").notNull(),

    // Quick-access fields (denormalized from fingerprint for queries)
    totalQuestions: integer("total_questions"),
    totalMarks: integer("total_marks"),
    durationMinutes: integer("duration_minutes"),
    negativeMarking: boolean("negative_marking"),
    subjectWeightage: jsonb("subject_weightage").$type<SubjectWeightage[]>().notNull(),
    difficultyDistribution: jsonb("difficulty_distribution")
      .$type<DifficultyDistribution>()
      .notNull(),
    topTopics: jsonb("top_topics").$type<TopicFrequency[]>().default([]),

    // Generation metadata
    aiProvider: varchar("ai_provider", { length: 50 }),
    aiTokensUsed: integer("ai_tokens_used").default(0),
    aiCostUsd: real("ai_cost_usd").default(0),
    version: integer("version").default(1),
    isCurrent: boolean("is_current").default(true),

    // Status
    status: varchar("status", { length: 20 }).default("draft"),

    createdBy: uuid("created_by").references(() => users.id),
    orgId: uuid("org_id").references(() => organizations.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("idx_exam_patterns_exam_current").on(table.examId)],
);
