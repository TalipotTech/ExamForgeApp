import { pgTable, uuid, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { creatorContent } from "./creator-content";
import { users } from "./users";
import { creatorProfiles } from "./creator-profiles";
import { classrooms } from "./classrooms";

export const contentViews = pgTable(
  "content_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => creatorContent.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    creatorId: uuid("creator_id").references(() => creatorProfiles.id),
    classroomId: uuid("classroom_id").references(() => classrooms.id),

    watchedSeconds: integer("watched_seconds").notNull().default(0),
    completed: boolean("completed").default(false),
    creditCost: integer("credit_cost").default(0),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("content_views_content_idx").on(table.contentId),
    index("content_views_user_idx").on(table.userId),
    index("content_views_creator_idx").on(table.creatorId),
    index("content_views_classroom_idx").on(table.classroomId),
  ],
);
