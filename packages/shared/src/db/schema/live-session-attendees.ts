import { pgTable, uuid, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { liveSessions } from "./live-sessions";
import { users } from "./users";

export const liveSessionAttendees = pgTable(
  "live_session_attendees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => liveSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    leftAt: timestamp("left_at"),
    watchSeconds: integer("watch_seconds").default(0),
  },
  (table) => [
    unique("live_session_attendees_session_user_unique").on(table.sessionId, table.userId),
    index("live_session_attendees_session_idx").on(table.sessionId),
    index("live_session_attendees_user_idx").on(table.userId),
  ],
);
