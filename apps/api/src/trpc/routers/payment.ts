import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import {
  subscriptionPlans,
  userSubscriptions,
  paymentOrders,
  userCredits,
} from "@examforge/shared/db/schema";
import {
  createSubscription,
  verifyPayment,
  cancelSubscription,
} from "../../services/payment-service.js";
import { getFlag } from "../../services/feature-flags.js";

export const paymentRouter = router({
  getPlans: publicProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true))
      .orderBy(subscriptionPlans.sortOrder);
  }),

  createSubscription: protectedProcedure
    .input(
      z.object({
        planName: z.enum(["pro", "premium"]),
        billingCycle: z.enum(["monthly", "yearly"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const enabled = await getFlag(ctx.db, "payment.enabled");
      if (!enabled) {
        return { enabled: false, message: "Payments are coming soon!" };
      }

      const result = await createSubscription(
        ctx.db,
        ctx.userId,
        input.planName,
        input.billingCycle,
      );
      return { enabled: true, ...result };
    }),

  verifyPayment: protectedProcedure
    .input(
      z.object({
        razorpay_payment_id: z.string(),
        razorpay_subscription_id: z.string(),
        razorpay_signature: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const success = await verifyPayment(ctx.db, {
        ...input,
        userId: ctx.userId,
      });

      if (!success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment verification failed",
        });
      }

      return { success: true };
    }),

  getCurrentSubscription: protectedProcedure.query(async ({ ctx }) => {
    const [sub] = await ctx.db
      .select({
        id: userSubscriptions.id,
        planId: userSubscriptions.planId,
        status: userSubscriptions.status,
        billingCycle: userSubscriptions.billingCycle,
        currentPeriodStart: userSubscriptions.currentPeriodStart,
        currentPeriodEnd: userSubscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: userSubscriptions.cancelAtPeriodEnd,
        planName: subscriptionPlans.name,
        planDisplayName: subscriptionPlans.displayName,
        creditsPerMonth: subscriptionPlans.creditsPerMonth,
      })
      .from(userSubscriptions)
      .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .where(and(eq(userSubscriptions.userId, ctx.userId), eq(userSubscriptions.status, "active")))
      .limit(1);

    // Get current credits
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [credits] = await ctx.db
      .select()
      .from(userCredits)
      .where(
        and(
          eq(userCredits.userId, ctx.userId),
          eq(userCredits.periodStart, periodStart.toISOString().split("T")[0]!),
        ),
      )
      .limit(1);

    return {
      subscription: sub ?? null,
      credits: credits
        ? {
            total: credits.creditsTotal,
            used: credits.creditsUsed,
            remaining: credits.creditsTotal - credits.creditsUsed,
          }
        : null,
    };
  }),

  // ═══ Switch plan (testing mode — no payment gateway yet) ═══
  switchPlan: protectedProcedure
    .input(
      z.object({
        planName: z.enum(["free", "pro", "premium"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // If switching to free, deactivate any active subscription
      if (input.planName === "free") {
        await ctx.db
          .update(userSubscriptions)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(
            and(eq(userSubscriptions.userId, ctx.userId), eq(userSubscriptions.status, "active")),
          );
        return { success: true as const, planName: "free", planDisplayName: "Free" };
      }

      // Find the target plan
      const [plan] = await ctx.db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.name, input.planName))
        .limit(1);

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Plan "${input.planName}" not found`,
        });
      }

      // Deactivate existing subscription if any
      await ctx.db
        .update(userSubscriptions)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(eq(userSubscriptions.userId, ctx.userId), eq(userSubscriptions.status, "active")),
        );

      // Create new active subscription (testing: no payment)
      const now = new Date();
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

      await ctx.db.insert(userSubscriptions).values({
        userId: ctx.userId,
        planId: plan.id,
        status: "active",
        billingCycle: "monthly",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      });

      return {
        success: true as const,
        planName: plan.name,
        planDisplayName: plan.displayName,
      };
    }),

  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    await cancelSubscription(ctx.db, ctx.userId);
    return { success: true };
  }),

  getPaymentHistory: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const orders = await ctx.db
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.userId, ctx.userId))
        .orderBy(desc(paymentOrders.createdAt))
        .limit(input.limit)
        .offset(offset);

      return orders;
    }),
});
