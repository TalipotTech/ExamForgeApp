import { pgTable, uuid, timestamp, index, unique } from "drizzle-orm/pg-core";
import { creatorProfiles } from "./creator-profiles";
import { users } from "./users";

export const creatorFollowers = pgTable(
  "creator_followers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followedAt: timestamp("followed_at").defaultNow().notNull(),
  },
  (table) => [
    unique("creator_followers_creator_student_unique").on(table.creatorId, table.studentId),
    index("creator_followers_creator_idx").on(table.creatorId),
    index("creator_followers_student_idx").on(table.studentId),
  ],
);
