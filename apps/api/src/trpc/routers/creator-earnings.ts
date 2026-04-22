import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { creatorEarnings, creatorProfiles, creatorWallets } from "@examforge/shared/db/schema";
import { requestPayoutSchema } from "@examforge/shared/validators";
import { router, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";
import { getFlag } from "../../services/feature-flags.js";

const DEFAULT_MIN_PAYOUT_INR = 50000; // paisa (₹500)

export const creatorEarningsRouter = router({
  wallet: protectedProcedure.query(async ({ ctx }) => {
    await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
    const [profile] = await ctx.db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, ctx.userId))
      .limit(1);
    if (!profile) return null;
    const [wallet] = await ctx.db
      .select()
      .from(creatorWallets)
      .where(eq(creatorWallets.creatorId, profile.id))
      .limit(1);
    return wallet ?? null;
  }),

  history: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
          status: z.enum(["pending", "available", "paid_out", "reversed"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      const [profile] = await ctx.db
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, ctx.userId))
        .limit(1);
      if (!profile) return [];
      const conds = [eq(creatorEarnings.creatorId, profile.id)];
      if (input?.status) conds.push(eq(creatorEarnings.status, input.status));
      return ctx.db
        .select()
        .from(creatorEarnings)
        .where(and(...conds))
        .orderBy(desc(creatorEarnings.createdAt))
        .limit(input?.limit ?? 50);
    }),

  /**
   * Flags an available balance for payout. The actual bank transfer is
   * processed off-platform (manual admin action or a future Razorpay X
   * integration); this procedure only records intent by marking available
   * earnings as `requested` and decrementing the wallet balance.
   */
  requestPayout: protectedProcedure.input(requestPayoutSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");

    const [profile] = await ctx.db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, ctx.userId))
      .limit(1);
    if (!profile) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not a registered creator" });
    }

    const kycRequired = (await getFlag(ctx.db, "creators.kyc_required_for_payout")) === true;
    if (kycRequired && profile.kycStatus !== "verified") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "KYC must be verified before requesting payout",
      });
    }
    if (!profile.payoutUpi && !profile.payoutBank) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Add a payout UPI or bank account before requesting payout",
      });
    }

    const [wallet] = await ctx.db
      .select()
      .from(creatorWallets)
      .where(eq(creatorWallets.creatorId, profile.id))
      .limit(1);
    if (!wallet) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No wallet found" });
    }

    const minPayoutFlag = await getFlag(ctx.db, "creators.min_payout_inr");
    const minPayout = typeof minPayoutFlag === "number" ? minPayoutFlag : DEFAULT_MIN_PAYOUT_INR;
    const requested = input.amountInr ?? wallet.balanceInr;

    if (requested <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to pay out" });
    }
    if (requested < minPayout) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Minimum payout is ${minPayout} paisa`,
      });
    }
    if (requested > wallet.balanceInr) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Requested amount exceeds available balance",
      });
    }

    const now = new Date();
    const payoutReference = `PO-${now.getTime().toString(36).toUpperCase()}`;

    // Move balance → requested bucket; admin will settle off-platform.
    await ctx.db
      .update(creatorWallets)
      .set({
        balanceInr: sql`${creatorWallets.balanceInr} - ${requested}`,
        updatedAt: now,
      })
      .where(eq(creatorWallets.id, wallet.id));

    await ctx.db.insert(creatorEarnings).values({
      creatorId: profile.id,
      earningType: "payout_request",
      amountInr: -requested,
      status: "requested",
      sourceType: "payout",
      payoutReference,
      description: `Payout request for ${requested} paisa`,
      metadata: {
        payoutUpi: profile.payoutUpi ?? null,
        hasBankDetails: !!profile.payoutBank,
      },
    });

    return { success: true as const, payoutReference, amountInr: requested };
  }),
});
