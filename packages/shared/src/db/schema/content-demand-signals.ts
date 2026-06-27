import { pgTable, uuid, bigint, varchar, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { exams } from "./exams";
import { syllabusNodes } from "./syllabus-nodes";

/**
 * Raw demand signals per syllabus node — the search-ranking feed that drives
 * demand-based auto-content generation (the ExamForge analog of Padvik's
 * `contentDemandSignals`). Aggregated by `demand-tracker.ts`
 * (SUM(weight) × LN(distinct users + 1) over a 30-day window).
 */
export const contentDemandSignals = pgTable(
  "content_demand_signals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    syllabusNodeId: bigint("syllabus_node_id", { mode: "number" })
      .notNull()
      .references(() => syllabusNodes.id, { onDelete: "cascade" }),
    examId: uuid("exam_id").references(() => exams.id, { onDelete: "set null" }),
    orgId: uuid("org_id"),
    // 'search' | 'view' | 'ask_ai' | 'exam_weak' | 'doubt' | 'direct'
    signalType: varchar("signal_type", { length: 30 }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    weight: numeric("weight", { precision: 4, scale: 1 }).notNull().default("1.0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("content_demand_signals_node_idx").on(table.syllabusNodeId),
    index("content_demand_signals_created_idx").on(table.createdAt),
  ],
);
