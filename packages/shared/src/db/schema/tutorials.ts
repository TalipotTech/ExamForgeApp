import {
  pgTable,
  bigserial,
  bigint,
  uuid,
  varchar,
  timestamp,
  text,
  integer,
  jsonb,
  boolean,
  real,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { syllabusNodes } from "./syllabus-nodes";
import { exams } from "./exams";
import { organizations } from "./organizations";
import { users } from "./users";

export type TutorialSection = {
  type:
    | "introduction"
    | "explanation"
    | "definition"
    | "formula"
    | "example"
    | "application"
    | "summary"
    | "references";
  title: string;
  body: string;
  provider?: string;
  key_terms?: string[];
};

export type TutorialContent = {
  sections: TutorialSection[];
  learning_objectives: string[];
  key_definitions: { term: string; definition: string }[];
  formulas?: { name: string; formula: string; explanation: string }[];
  mnemonics?: { topic: string; mnemonic: string }[];
  clinical_applications?: string[];
  difficulty_level: "introductory" | "intermediate" | "advanced";
};

export const tutorials = pgTable(
  "tutorials",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    syllabusNodeId: bigint("syllabus_node_id", { mode: "number" })
      .notNull()
      .references(() => syllabusNodes.id, { onDelete: "cascade" }),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),
    orgId: uuid("org_id").references(() => organizations.id),
    version: integer("version").notNull().default(1),
    title: varchar("title", { length: 500 }).notNull(),
    content: jsonb("content").$type<TutorialContent>().notNull(),
    contentText: text("content_text").notNull(),
    providersUsed: jsonb("providers_used").$type<string[]>().notNull(),
    generationConfig: jsonb("generation_config").$type<Record<string, unknown>>().default({}),
    wordCount: integer("word_count"),
    estimatedReadMinutes: integer("estimated_read_minutes"),
    qualityScore: real("quality_score"),
    isCurrent: boolean("is_current").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => [
    index("tutorials_node_idx").on(table.syllabusNodeId),
    index("tutorials_current_idx")
      .on(table.syllabusNodeId, table.isCurrent)
      .where(sql`${table.isCurrent} = true`),
  ],
);
