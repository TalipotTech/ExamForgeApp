/**
 * question_verifications — audit trail for the 7-layer verification
 * pipeline described in docs/features/QUESTION_ACQUISITION_STRATEGY.md.
 *
 * Each row is ONE layer's verdict on ONE question. A question running
 * through the full pipeline produces ~6-7 rows here (one per layer +
 * composite). The most recent row per (questionId, layer) is the
 * authoritative latest verdict; earlier rows preserve history (retries,
 * admin overrides).
 */

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
  integer,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { questions } from "./questions";
import { users } from "./users";

export const questionVerifications = pgTable(
  "question_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    // Which layer produced this verdict:
    // source | factual | syllabus | pattern | duplicate | composite | admin
    layer: varchar("layer", { length: 30 }).notNull(),
    // pass | fail | flag | skip
    result: varchar("result", { length: 20 }).notNull(),
    // 0.0-1.0 — layer-specific confidence (null for pure pass/fail verdicts
    // like source or admin).
    score: doublePrecision("score"),
    // Full payload from the AI verifier, or admin notes, or the composite
    // breakdown. Shape depends on `layer`.
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    // Which AI did the verification, and how much it cost
    aiProvider: varchar("ai_provider", { length: 50 }),
    aiTokensUsed: integer("ai_tokens_used").default(0),
    // Admin who performed the layer='admin' review (null for AI layers)
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("question_verifications_question_idx").on(table.questionId),
    index("question_verifications_layer_idx").on(table.layer),
    index("question_verifications_result_idx").on(table.result),
  ],
);
