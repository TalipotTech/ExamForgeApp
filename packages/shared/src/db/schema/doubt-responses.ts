import { pgTable, uuid, varchar, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { doubts } from "./doubts";
import { users } from "./users";

export const doubtResponses = pgTable(
  "doubt_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    doubtId: uuid("doubt_id")
      .notNull()
      .references(() => doubts.id, { onDelete: "cascade" }),
    responderId: uuid("responder_id")
      .notNull()
      .references(() => users.id),

    responseText: text("response_text").notNull(),
    responseType: varchar("response_type", { length: 20 }).notNull().default("text"),
    mediaUrl: text("media_url"),

    isAi: boolean("is_ai").default(false),
    isAccepted: boolean("is_accepted").default(false),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("doubt_responses_doubt_idx").on(table.doubtId),
    index("doubt_responses_responder_idx").on(table.responderId),
  ],
);
