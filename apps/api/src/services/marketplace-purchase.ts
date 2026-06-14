import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@examforge/shared/db";
import {
  creatorEarnings,
  creatorProfiles,
  creatorWallets,
  marketplaceListings,
  marketplacePurchases,
  paymentOrders,
} from "@examforge/shared/db/schema";
import { getFlag } from "./feature-flags.js";

const SETTLEMENT_COOLDOWN_DAYS = 7;
const DEFAULT_VERIFIED_SHARE = 70;
const DEFAULT_PREMIUM_SHARE = 80;

function getRazorpayCredentials(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials not configured");
  }
  return { keyId, keySecret };
}

async function razorpayRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  const { keyId, keySecret } = getRazorpayCredentials();
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
  return (await res.json()) as T;
}

async function resolveRevenueSharePercent(
  db: Database,
  tier: string | null | undefined,
): Promise<number> {
  if (tier === "pro_creator" || tier === "institute") {
    const premium = await getFlag(db, "creators.revenue_share_premium");
    return typeof premium === "number" ? premium : DEFAULT_PREMIUM_SHARE;
  }
  const verified = await getFlag(db, "creators.revenue_share_verified");
  return typeof verified === "number" ? verified : DEFAULT_VERIFIED_SHARE;
}

type Listing = typeof marketplaceListings.$inferSelect;
type Profile = typeof creatorProfiles.$inferSelect;
type PaymentOrder = typeof paymentOrders.$inferSelect;

async function loadListingAndCreator(
  db: Database,
  listingId: string,
): Promise<{ listing: Listing; creator: Profile }> {
  const [listing] = await db
    .select()
    .from(marketplaceListings)
    .where(eq(marketplaceListings.id, listingId))
    .limit(1);
  if (!listing || !listing.isPublished || listing.status !== "active") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Listing is not available for purchase" });
  }
  const [creator] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, listing.creatorId))
    .limit(1);
  if (!creator) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Creator profile missing" });
  }
  return { listing, creator };
}

export type CreatePurchaseOrderResult = {
  purchaseId: string;
  razorpayOrderId: string;
  razorpayKeyId: string;
  amountInr: number;
  currency: "INR";
};

export async function createMarketplacePurchaseOrder(
  db: Database,
  buyerId: string,
  listingId: string,
): Promise<CreatePurchaseOrderResult> {
  const { listing, creator } = await loadListingAndCreator(db, listingId);

  if (creator.userId === buyerId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Creators cannot purchase their own listings",
    });
  }

  const [existing] = await db
    .select({ id: marketplacePurchases.id })
    .from(marketplacePurchases)
    .where(
      and(
        eq(marketplacePurchases.listingId, listingId),
        eq(marketplacePurchases.buyerId, buyerId),
        eq(marketplacePurchases.status, "paid"),
      ),
    )
    .limit(1);
  if (existing) {
    throw new TRPCError({ code: "CONFLICT", message: "You already own this listing" });
  }

  const sharePercent = await resolveRevenueSharePercent(db, creator.creatorTier);
  const amountInr = listing.priceInr;
  const creatorEarningInr = Math.floor((amountInr * sharePercent) / 100);
  const platformFeeInr = amountInr - creatorEarningInr;

  const razorpayOrder = await razorpayRequest<{ id: string }>("/orders", "POST", {
    amount: amountInr,
    currency: "INR",
    notes: {
      listing_id: listingId,
      buyer_id: buyerId,
      creator_id: creator.id,
      type: "marketplace_purchase",
    },
  });

  const [order] = await db
    .insert(paymentOrders)
    .values({
      userId: buyerId,
      orderType: "marketplace_purchase",
      amountInr,
      status: "created",
      razorpayOrderId: razorpayOrder.id,
      metadata: {
        listingId,
        creatorId: creator.id,
        platformFeeInr,
        creatorEarningInr,
        sharePercent,
      },
    })
    .returning({ id: paymentOrders.id });
  if (!order) {
    throw new Error("Failed to record payment order");
  }

  const [purchase] = await db
    .insert(marketplacePurchases)
    .values({
      listingId,
      buyerId,
      creatorId: creator.id,
      amountInr,
      platformFeeInr,
      creatorEarningInr,
      paymentOrderId: order.id,
      status: "pending",
      metadata: { sharePercent },
    })
    .returning({ id: marketplacePurchases.id });
  if (!purchase) {
    throw new Error("Failed to record marketplace purchase");
  }

  const { keyId } = getRazorpayCredentials();
  return {
    purchaseId: purchase.id,
    razorpayOrderId: razorpayOrder.id,
    razorpayKeyId: keyId,
    amountInr,
    currency: "INR",
  };
}

type FulfillOutcome =
  | { fulfilled: true; purchaseId: string; listingId: string; alreadyPaid: boolean }
  | { fulfilled: false; reason: "ORDER_NOT_FOUND" | "PURCHASE_NOT_FOUND" };

/**
 * Idempotent state transition: captured payment → paid purchase → wallet +
 * earnings + counters. Callers (client verify + webhook) are responsible for
 * authenticating the payment beforehand (either HMAC on payment_id|order_id
 * or the Razorpay webhook HMAC over the raw body).
 */
async function applyPurchaseCaptured(
  db: Database,
  order: PaymentOrder,
  razorpayPaymentId: string,
  razorpaySignature?: string,
): Promise<FulfillOutcome> {
  const [purchase] = await db
    .select()
    .from(marketplacePurchases)
    .where(eq(marketplacePurchases.paymentOrderId, order.id))
    .limit(1);
  if (!purchase) {
    return { fulfilled: false, reason: "PURCHASE_NOT_FOUND" };
  }

  if (purchase.status === "paid") {
    return {
      fulfilled: true,
      purchaseId: purchase.id,
      listingId: purchase.listingId,
      alreadyPaid: true,
    };
  }

  const now = new Date();
  const availableAt = new Date(now.getTime() + SETTLEMENT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  await db
    .update(paymentOrders)
    .set({
      status: "captured",
      razorpayPaymentId,
      ...(razorpaySignature ? { razorpaySignature } : {}),
      updatedAt: now,
    })
    .where(eq(paymentOrders.id, order.id));

  await db
    .update(marketplacePurchases)
    .set({ status: "paid", purchasedAt: now })
    .where(eq(marketplacePurchases.id, purchase.id));

  await db
    .insert(creatorWallets)
    .values({
      creatorId: purchase.creatorId,
      balanceInr: 0,
      pendingInr: purchase.creatorEarningInr,
      lifetimeEarnedInr: purchase.creatorEarningInr,
    })
    .onConflictDoUpdate({
      target: creatorWallets.creatorId,
      set: {
        pendingInr: sql`${creatorWallets.pendingInr} + ${purchase.creatorEarningInr}`,
        lifetimeEarnedInr: sql`${creatorWallets.lifetimeEarnedInr} + ${purchase.creatorEarningInr}`,
        updatedAt: now,
      },
    });

  await db.insert(creatorEarnings).values({
    creatorId: purchase.creatorId,
    earningType: "marketplace_sale",
    amountInr: purchase.creatorEarningInr,
    sourcePurchaseId: purchase.id,
    sourceType: "marketplace_purchase",
    sourceId: purchase.id,
    status: "pending",
    availableAt,
    description: `Sale of listing ${purchase.listingId}`,
    metadata: {
      platformFeeInr: purchase.platformFeeInr,
      grossInr: purchase.amountInr,
    },
  });

  await db
    .update(marketplaceListings)
    .set({ purchaseCount: sql`${marketplaceListings.purchaseCount} + 1` })
    .where(eq(marketplaceListings.id, purchase.listingId));

  await db
    .update(creatorProfiles)
    .set({
      totalSales: sql`${creatorProfiles.totalSales} + 1`,
      totalRevenueEarned: sql`${creatorProfiles.totalRevenueEarned} + ${purchase.creatorEarningInr}`,
      updatedAt: now,
    })
    .where(eq(creatorProfiles.id, purchase.creatorId));

  return {
    fulfilled: true,
    purchaseId: purchase.id,
    listingId: purchase.listingId,
    alreadyPaid: false,
  };
}

export type VerifyPurchaseResult =
  | { success: true; purchaseId: string; listingId: string }
  | { success: false; reason: "INVALID_SIGNATURE" | "ORDER_NOT_FOUND" | "ALREADY_FULFILLED" };

export async function verifyAndFulfillMarketplacePurchase(
  db: Database,
  buyerId: string,
  params: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
): Promise<VerifyPurchaseResult> {
  const { keySecret } = getRazorpayCredentials();
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? keySecret;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest("hex");
  if (expectedSignature !== params.razorpaySignature) {
    return { success: false, reason: "INVALID_SIGNATURE" };
  }

  const [order] = await db
    .select()
    .from(paymentOrders)
    .where(
      and(
        eq(paymentOrders.razorpayOrderId, params.razorpayOrderId),
        eq(paymentOrders.userId, buyerId),
        eq(paymentOrders.orderType, "marketplace_purchase"),
      ),
    )
    .limit(1);
  if (!order) {
    return { success: false, reason: "ORDER_NOT_FOUND" };
  }

  const outcome = await applyPurchaseCaptured(
    db,
    order,
    params.razorpayPaymentId,
    params.razorpaySignature,
  );
  if (!outcome.fulfilled) {
    return { success: false, reason: "ORDER_NOT_FOUND" };
  }
  return { success: true, purchaseId: outcome.purchaseId, listingId: outcome.listingId };
}

export type WebhookOutcome =
  | { handled: true; action: "fulfilled" | "already_fulfilled" | "failed_recorded" | "ignored" }
  | { handled: false; reason: "ORDER_NOT_FOUND" | "MISSING_FIELDS" };

/**
 * Handles Razorpay webhook events relevant to marketplace orders. The caller
 * MUST have verified the x-razorpay-signature header over the raw body before
 * invoking this — we don't re-verify here.
 *
 * Supported events:
 *   - payment.captured  → mark purchase paid (idempotent)
 *   - order.paid        → mark purchase paid (idempotent)
 *   - payment.failed    → annotate paymentOrders.errorMessage, leave purchase pending
 *   - subscription.*    → ignored here (handled by payment-service.handleWebhook)
 */
export async function handleMarketplaceWebhook(
  db: Database,
  event: string,
  payload: Record<string, unknown>,
): Promise<WebhookOutcome> {
  if (event === "payment.captured" || event === "order.paid") {
    const razorpayOrderId = extractOrderId(event, payload);
    const razorpayPaymentId = extractPaymentId(event, payload);
    if (!razorpayOrderId || !razorpayPaymentId) {
      return { handled: false, reason: "MISSING_FIELDS" };
    }

    const [order] = await db
      .select()
      .from(paymentOrders)
      .where(
        and(
          eq(paymentOrders.razorpayOrderId, razorpayOrderId),
          eq(paymentOrders.orderType, "marketplace_purchase"),
        ),
      )
      .limit(1);
    if (!order) {
      return { handled: false, reason: "ORDER_NOT_FOUND" };
    }

    const outcome = await applyPurchaseCaptured(db, order, razorpayPaymentId);
    if (!outcome.fulfilled) {
      return { handled: false, reason: "ORDER_NOT_FOUND" };
    }
    return {
      handled: true,
      action: outcome.alreadyPaid ? "already_fulfilled" : "fulfilled",
    };
  }

  if (event === "payment.failed") {
    const razorpayOrderId = extractOrderId(event, payload);
    if (!razorpayOrderId) {
      return { handled: false, reason: "MISSING_FIELDS" };
    }
    const paymentEntity = (payload.payment as { entity?: Record<string, unknown> } | undefined)
      ?.entity;
    const errorDescription =
      (paymentEntity?.error_description as string | undefined) ?? "Payment failed";

    await db
      .update(paymentOrders)
      .set({ status: "failed", errorMessage: errorDescription, updatedAt: new Date() })
      .where(
        and(
          eq(paymentOrders.razorpayOrderId, razorpayOrderId),
          eq(paymentOrders.orderType, "marketplace_purchase"),
        ),
      );
    return { handled: true, action: "failed_recorded" };
  }

  return { handled: true, action: "ignored" };
}

function extractPaymentEntity(payload: Record<string, unknown>): Record<string, unknown> | null {
  const payment = payload.payment as { entity?: Record<string, unknown> } | undefined;
  return payment?.entity ?? null;
}

function extractOrderEntity(payload: Record<string, unknown>): Record<string, unknown> | null {
  const order = payload.order as { entity?: Record<string, unknown> } | undefined;
  return order?.entity ?? null;
}

function extractOrderId(event: string, payload: Record<string, unknown>): string | null {
  if (event === "order.paid") {
    const entity = extractOrderEntity(payload);
    return (entity?.id as string | undefined) ?? null;
  }
  const entity = extractPaymentEntity(payload);
  return (entity?.order_id as string | undefined) ?? null;
}

function extractPaymentId(event: string, payload: Record<string, unknown>): string | null {
  if (event === "order.paid") {
    // order.paid includes a payment entity alongside the order
    const payment = extractPaymentEntity(payload);
    return (payment?.id as string | undefined) ?? null;
  }
  const entity = extractPaymentEntity(payload);
  return (entity?.id as string | undefined) ?? null;
}

/**
 * Move all `pending` creator_earnings past their cooldown into `available`,
 * and reflect that by moving funds from wallet.pendingInr → balanceInr.
 * Invoked by the earnings-settlement worker on a daily cron.
 */
export async function settleMatureEarnings(db: Database): Promise<{ settledCount: number }> {
  const now = new Date();
  const mature = await db
    .select()
    .from(creatorEarnings)
    .where(
      and(eq(creatorEarnings.status, "pending"), sql`${creatorEarnings.availableAt} <= ${now}`),
    );

  for (const earning of mature) {
    await db
      .update(creatorEarnings)
      .set({ status: "available" })
      .where(eq(creatorEarnings.id, earning.id));

    await db
      .update(creatorWallets)
      .set({
        pendingInr: sql`${creatorWallets.pendingInr} - ${earning.amountInr}`,
        balanceInr: sql`${creatorWallets.balanceInr} + ${earning.amountInr}`,
        updatedAt: now,
      })
      .where(eq(creatorWallets.creatorId, earning.creatorId));
  }

  return { settledCount: mature.length };
}
