import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  text,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { sql } from "drizzle-orm";

export const otpVerifications = pgTable(
  "otp_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    identifierType: varchar("identifier_type", { length: 10 }).notNull(),
    otpCode: varchar("otp_code", { length: 255 }).notNull(),
    purpose: varchar("purpose", { length: 30 }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    isUsed: boolean("is_used").notNull().default(false),
    expiresAt: timestamp("expires_at").notNull(),
    verifiedAt: timestamp("verified_at"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_otp_identifier")
      .on(table.identifier, table.purpose)
      .where(sql`is_used = false`),
    index("idx_otp_expiry")
      .on(table.expiresAt)
      .where(sql`is_used = false`),
  ],
);
