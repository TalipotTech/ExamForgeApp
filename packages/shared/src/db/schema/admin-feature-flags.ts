import { pgTable, uuid, varchar, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const adminFeatureFlags = pgTable("admin_feature_flags", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: jsonb("value").notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
