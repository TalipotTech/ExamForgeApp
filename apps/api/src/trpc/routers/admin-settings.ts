import { z } from "zod";
import { router, superAdminProcedure } from "../trpc.js";
import { adminFeatureFlags } from "@examforge/shared/db/schema";
import { setFlag } from "../../services/feature-flags.js";

export const adminSettingsRouter = router({
  getFlags: superAdminProcedure.query(async ({ ctx }) => {
    const flags = await ctx.db
      .select()
      .from(adminFeatureFlags)
      .orderBy(adminFeatureFlags.category, adminFeatureFlags.key);

    // Group by category
    const grouped: Record<string, typeof flags> = {};
    for (const flag of flags) {
      if (!grouped[flag.category]) grouped[flag.category] = [];
      grouped[flag.category]!.push(flag);
    }
    return grouped;
  }),

  updateFlag: superAdminProcedure
    .input(z.object({ key: z.string(), value: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      await setFlag(ctx.db, input.key, input.value, ctx.userId);
      return { success: true };
    }),

  updateFlags: superAdminProcedure
    .input(z.object({ flags: z.array(z.object({ key: z.string(), value: z.unknown() })) }))
    .mutation(async ({ ctx, input }) => {
      for (const flag of input.flags) {
        await setFlag(ctx.db, flag.key, flag.value, ctx.userId);
      }
      return { success: true };
    }),

  testSms: superAdminProcedure
    .input(z.object({ phone: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { sendOtpSms } = await import("../../services/sms-service.js");
      await sendOtpSms(ctx.db, input.phone, "123456");
      return { success: true, message: "Test SMS sent (check console if no provider configured)" };
    }),

  testPayment: superAdminProcedure.mutation(async ({ ctx: _ctx }) => {
    // Simple connection test
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return { success: false, message: "Razorpay credentials not configured" };
    }

    try {
      const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
        },
        body: JSON.stringify({ amount: 100, currency: "INR", receipt: "test_receipt" }),
      });

      if (res.ok) {
        return { success: true, message: "Razorpay connection successful" };
      }
      const err = await res.text();
      return { success: false, message: `Razorpay error: ${err}` };
    } catch (err) {
      return { success: false, message: `Connection failed: ${(err as Error).message}` };
    }
  }),
});
