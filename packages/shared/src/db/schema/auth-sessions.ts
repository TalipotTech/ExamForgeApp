import { pgTable, uuid, varchar, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { sql } from "drizzle-orm";

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),
    deviceInfo: jsonb("device_info")
      .$type<{
        browser?: string;
        os?: string;
        device?: string;
        ip?: string;
        location?: string;
      }>()
      .default({}),
    isActive: boolean("is_active").notNull().default(true),
    isImpersonated: boolean("is_impersonated").notNull().default(false),
    lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_auth_sessions_user").on(table.userId),
    index("idx_auth_sessions_token")
      .on(table.sessionToken)
      .where(sql`is_active = true`),
  ],
);
