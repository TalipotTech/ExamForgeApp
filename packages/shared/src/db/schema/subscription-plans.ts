import { pgTable, uuid, varchar, integer, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";

export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  priceMonthlyInr: integer("price_monthly_inr").notNull(),
  priceYearlyInr: integer("price_yearly_inr").notNull(),
  creditsPerMonth: integer("credits_per_month").notNull(),
  maxExams: integer("max_exams").notNull(),
  maxTutorialsFree: integer("max_tutorials_free").notNull(),
  maxAiQuestions: integer("max_ai_questions").notNull(),
  maxMockExams: integer("max_mock_exams").notNull(),
  features: jsonb("features")
    .$type<{
      explanations: boolean;
      syllabus_structure: boolean;
      basic_analytics: boolean;
      detailed_analytics: boolean;
      ai_insights: boolean;
      ad_free: boolean;
    }>()
    .notNull(),
  razorpayPlanIdMonthly: varchar("razorpay_plan_id_monthly", { length: 100 }),
  razorpayPlanIdYearly: varchar("razorpay_plan_id_yearly", { length: 100 }),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
