import { eq, and } from "drizzle-orm";
import type { Database } from "@examforge/shared/db";
import {
  paymentOrders,
  subscriptionPlans,
  userSubscriptions,
  userCredits,
} from "@examforge/shared/db/schema";
import { getFlag } from "./feature-flags.js";
import crypto from "node:crypto";

function getRazorpayInstance(): {
  keyId: string;
  keySecret: string;
} {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials not configured");
  }
  return { keyId, keySecret };
}

async function razorpayRequest(path: string, method: string, body?: unknown): Promise<unknown> {
  const { keyId, keySecret } = getRazorpayInstance();
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Razorpay API error: ${err}`);
  }
  return res.json();
}

export async function createSubscription(
  db: Database,
  userId: string,
  planName: string,
  billingCycle: "monthly" | "yearly",
): Promise<{ subscriptionId: string; razorpayKeyId: string }> {
  const enabled = await getFlag(db, "payment.enabled");
  if (!enabled) {
    throw new Error("Payments are not enabled yet.");
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.name, planName))
    .limit(1);

  if (!plan) throw new Error("Plan not found");

  const razorpayPlanId =
    billingCycle === "yearly" ? plan.razorpayPlanIdYearly : plan.razorpayPlanIdMonthly;

  if (!razorpayPlanId) throw new Error("Razorpay plan not configured for this billing cycle");

  const subscription = (await razorpayRequest("/subscriptions", "POST", {
    plan_id: razorpayPlanId,
    customer_notify: 1,
    total_count: billingCycle === "yearly" ? 1 : 12,
  })) as { id: string };

  const amount = billingCycle === "yearly" ? plan.priceYearlyInr : plan.priceMonthlyInr;

  await db.insert(paymentOrders).values({
    userId,
    orderType: "subscription",
    amountInr: amount,
    status: "created",
    razorpayOrderId: subscription.id,
    planId: plan.id,
    billingCycle,
  });

  const { keyId } = getRazorpayInstance();
  return { subscriptionId: subscription.id, razorpayKeyId: keyId };
}

export async function verifyPayment(
  db: Database,
  params: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
    userId: string;
  },
): Promise<boolean> {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? getRazorpayInstance().keySecret;

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${params.razorpay_payment_id}|${params.razorpay_subscription_id}`)
    .digest("hex");

  if (expectedSignature !== params.razorpay_signature) {
    return false;
  }

  // Update payment order
  await db
    .update(paymentOrders)
    .set({
      status: "captured",
      razorpayPaymentId: params.razorpay_payment_id,
      razorpaySignature: params.razorpay_signature,
      updatedAt: new Date(),
    })
    .where(eq(paymentOrders.razorpayOrderId, params.razorpay_subscription_id));

  // Get the payment order to find plan
  const [order] = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.razorpayOrderId, params.razorpay_subscription_id))
    .limit(1);

  if (!order?.planId) return true;

  // Get plan details
  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, order.planId))
    .limit(1);

  if (!plan) return true;

  // Update or create subscription
  const now = new Date();
  const periodEnd =
    order.billingCycle === "yearly"
      ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
      : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

  // Deactivate old subscriptions
  await db
    .update(userSubscriptions)
    .set({ status: "cancelled", updatedAt: now })
    .where(
      and(eq(userSubscriptions.userId, params.userId), eq(userSubscriptions.status, "active")),
    );

  // Create new subscription
  await db.insert(userSubscriptions).values({
    userId: params.userId,
    planId: plan.id,
    status: "active",
    billingCycle: order.billingCycle,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    razorpaySubscriptionId: params.razorpay_subscription_id,
  });

  // Update credits
  const periodStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  await db
    .insert(userCredits)
    .values({
      userId: params.userId,
      periodStart: periodStartDate.toISOString().split("T")[0]!,
      periodEnd: periodEndDate.toISOString().split("T")[0]!,
      creditsTotal: plan.creditsPerMonth,
      creditsUsed: 0,
    })
    .onConflictDoNothing();

  return true;
}

export async function cancelSubscription(db: Database, userId: string): Promise<void> {
  const [sub] = await db
    .select()
    .from(userSubscriptions)
    .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
    .limit(1);

  if (!sub) throw new Error("No active subscription found");

  if (sub.razorpaySubscriptionId) {
    await razorpayRequest(`/subscriptions/${sub.razorpaySubscriptionId}/cancel`, "POST");
  }

  await db
    .update(userSubscriptions)
    .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
    .where(eq(userSubscriptions.id, sub.id));
}

export async function handleWebhook(
  db: Database,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const entity = payload.entity as Record<string, unknown> | undefined;
  if (!entity) return;

  const subscriptionId = (entity.subscription_id ?? entity.id) as string | undefined;
  if (!subscriptionId) return;

  const [sub] = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.razorpaySubscriptionId, subscriptionId))
    .limit(1);

  if (!sub) return;

  switch (event) {
    case "subscription.activated":
      await db
        .update(userSubscriptions)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(userSubscriptions.id, sub.id));
      break;

    case "subscription.halted":
      await db
        .update(userSubscriptions)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(userSubscriptions.id, sub.id));
      break;

    case "subscription.cancelled":
      await db
        .update(userSubscriptions)
        .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
        .where(eq(userSubscriptions.id, sub.id));
      break;

    case "subscription.pending":
      await db
        .update(userSubscriptions)
        .set({ status: "past_due", updatedAt: new Date() })
        .where(eq(userSubscriptions.id, sub.id));
      break;
  }
}
