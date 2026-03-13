import { pgTable, uuid, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => users.id),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("target_type", { length: 50 }),
    targetId: uuid("target_id"),
    details: jsonb("details")
      .$type<{
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
        reason?: string;
      }>()
      .default({}),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_audit_admin").on(table.adminId),
    index("idx_audit_target").on(table.targetType, table.targetId),
  ],
);
