import {
  pgTable,
  bigserial,
  bigint,
  uuid,
  varchar,
  timestamp,
  integer,
  jsonb,
  boolean,
  real,
  index,
} from "drizzle-orm/pg-core";
import { syllabi } from "./syllabi";
import { exams } from "./exams";
import { syllabusNodes } from "./syllabus-nodes";
import { users } from "./users";

export type GenerationProgressEntry = {
  nodeId: number;
  title: string;
  status: "pending" | "generating" | "completed" | "error";
  startedAt?: string;
  completedAt?: string;
  wordCount?: number;
  error?: string;
};

export const tutorialGenerationJobs = pgTable(
  "tutorial_generation_jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    syllabusId: bigint("syllabus_id", { mode: "number" })
      .notNull()
      .references(() => syllabi.id),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),

    status: varchar("status", { length: 20 }).notNull().default("queued"),
    totalNodes: integer("total_nodes").notNull(),
    completedNodes: integer("completed_nodes").default(0),
    failedNodes: integer("failed_nodes").default(0),
    currentNodeId: bigint("current_node_id", { mode: "number" }).references(() => syllabusNodes.id),
    currentNodeTitle: varchar("current_node_title", { length: 500 }),

    // Config
    aiProviders: jsonb("ai_providers").$type<string[]>().notNull().default(["claude"]),
    generatePreviews: boolean("generate_previews").default(true),
    previewPercentage: integer("preview_percentage").default(30),
    includeDiagrams: boolean("include_diagrams").default(true),
    includeMnemonics: boolean("include_mnemonics").default(true),
    includeReferences: boolean("include_references").default(true),

    // Cost tracking
    totalTokens: integer("total_tokens").default(0),
    totalCostUsd: real("total_cost_usd").default(0),

    // Progress
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    errorLog: jsonb("error_log")
      .$type<Array<{ nodeId: number; error: string; timestamp: string }>>()
      .default([]),
    progressLog: jsonb("progress_log").$type<GenerationProgressEntry[]>().default([]),

    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("tutorial_gen_jobs_syllabus_idx").on(table.syllabusId),
    index("tutorial_gen_jobs_status_idx").on(table.status),
  ],
);
