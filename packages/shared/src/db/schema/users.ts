import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  boolean,
  text,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const userRoleEnum = pgEnum("user_role", ["student", "teacher", "admin", "superadmin"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).unique(),
  name: varchar("name", { length: 255 }).notNull(),
  username: varchar("username", { length: 50 }).unique(),
  phone: varchar("phone", { length: 20 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  role: userRoleEnum("role").notNull().default("student"),
  avatarUrl: varchar("avatar_url", { length: 1000 }),
  orgId: uuid("org_id").references(() => organizations.id),

  // Verification
  emailVerified: timestamp("email_verified"),
  phoneVerified: timestamp("phone_verified"),

  // Auth provider
  authProvider: varchar("auth_provider", { length: 20 }).notNull().default("credentials"),
  googleId: varchar("google_id", { length: 100 }).unique(),

  // Account status
  isActive: boolean("is_active").notNull().default(true),
  isBanned: boolean("is_banned").notNull().default(false),
  banReason: text("ban_reason"),

  // Onboarding
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),

  // PIN login
  pinHash: varchar("pin_hash", { length: 255 }),

  // Login tracking
  lastLoginAt: timestamp("last_login_at"),
  lastLoginIp: varchar("last_login_ip", { length: 45 }),
  loginCount: integer("login_count").notNull().default(0),
  unverifiedLoginCount: integer("unverified_login_count").notNull().default(0),

  // Signup info
  signupSource: varchar("signup_source", { length: 50 }),
  referredBy: uuid("referred_by"),

  // Extensible
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
