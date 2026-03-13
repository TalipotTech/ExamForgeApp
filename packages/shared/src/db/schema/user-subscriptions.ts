import { pgTable, uuid, varchar, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { subscriptionPlans } from "./subscription-plans";
import { sql } from "drizzle-orm";

export const userSubscriptions = pgTable(
  "user_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    billingCycle: varchar("billing_cycle", { length: 10 }),
    currentPeriodStart: timestamp("current_period_start").notNull(),
    currentPeriodEnd: timestamp("current_period_end").notNull(),
    razorpaySubscriptionId: varchar("razorpay_subscription_id", { length: 100 }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_user_sub_active")
      .on(table.userId)
      .where(sql`status = 'active'`),
  ],
);
