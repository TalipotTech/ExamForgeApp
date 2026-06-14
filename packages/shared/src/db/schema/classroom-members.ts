import { pgTable, uuid, varchar, timestamp, index, unique } from "drizzle-orm/pg-core";
import { classrooms } from "./classrooms";
import { users } from "./users";
import { paymentOrders } from "./payment-orders";

export const classroomMembers = pgTable(
  "classroom_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    role: varchar("role", { length: 20 }).notNull().default("student"),
    status: varchar("status", { length: 20 }).notNull().default("active"),

    subscriptionStatus: varchar("subscription_status", { length: 20 }),
    subscriptionExpiresAt: timestamp("subscription_expires_at"),
    paymentOrderId: uuid("payment_order_id").references(() => paymentOrders.id),

    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    removedAt: timestamp("removed_at"),
  },
  (table) => [
    unique("classroom_members_classroom_student_unique").on(table.classroomId, table.studentId),
    index("classroom_members_classroom_idx").on(table.classroomId),
    index("classroom_members_student_idx").on(table.studentId),
  ],
);
