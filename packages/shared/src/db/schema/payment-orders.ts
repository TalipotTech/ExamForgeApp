import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { subscriptionPlans } from "./subscription-plans";

export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    orderType: varchar("order_type", { length: 30 }).notNull(),
    amountInr: integer("amount_inr").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    status: varchar("status", { length: 20 }).notNull().default("created"),
    razorpayOrderId: varchar("razorpay_order_id", { length: 100 }).unique(),
    razorpayPaymentId: varchar("razorpay_payment_id", { length: 100 }),
    razorpaySignature: varchar("razorpay_signature", { length: 255 }),
    planId: uuid("plan_id").references(() => subscriptionPlans.id),
    billingCycle: varchar("billing_cycle", { length: 10 }),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_payment_orders_user").on(table.userId),
    index("idx_payment_orders_razorpay").on(table.razorpayOrderId),
  ],
);
