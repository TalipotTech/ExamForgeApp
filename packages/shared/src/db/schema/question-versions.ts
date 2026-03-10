import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { questions } from "./questions";
import { users } from "./users";

export const changeTypeEnum = pgEnum("change_type", [
  "created",
  "updated",
  "reviewed",
  "translated",
  "archived",
]);

export const questionVersions = pgTable(
  "question_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    changedBy: uuid("changed_by").references(() => users.id),
    changeType: changeTypeEnum("change_type").notNull().default("updated"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("question_versions_question_id_idx").on(table.questionId),
  ],
);
