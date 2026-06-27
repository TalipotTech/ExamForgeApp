import {
  pgTable,
  uuid,
  bigint,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { exams } from "./exams";
import { syllabusNodes } from "./syllabus-nodes";

/**
 * Append-only per-user topic search log. Recent-first on read
 * (`ORDER BY created_at DESC`), de-duped in the query — no UNIQUE here.
 * Rejected (off-syllabus) searches are kept too, with `was_rejected=true`,
 * but skipped when building the "recently searched" list.
 */
export const topicSearchHistory = pgTable(
  "topic_search_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id"),
    examId: uuid("exam_id").references(() => exams.id, { onDelete: "set null" }),
    query: varchar("query", { length: 500 }).notNull(),
    matchedNodeId: bigint("matched_node_id", { mode: "number" }).references(
      () => syllabusNodes.id,
      { onDelete: "set null" },
    ),
    resultCount: integer("result_count").default(0),
    wasRejected: boolean("was_rejected").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("topic_search_history_user_created_idx").on(table.userId, table.createdAt.desc()),
    index("topic_search_history_matched_node_idx").on(table.matchedNodeId),
  ],
);
