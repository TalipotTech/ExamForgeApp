import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { creatorEarnings, creatorProfiles, creatorWallets } from "@examforge/shared/db/schema";
import { router, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";

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
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      const [profile] = await ctx.db
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, ctx.userId))
        .limit(1);
      if (!profile) return [];
      return ctx.db
        .select()
        .from(creatorEarnings)
        .where(eq(creatorEarnings.creatorId, profile.id))
        .orderBy(desc(creatorEarnings.createdAt))
        .limit(input?.limit ?? 50);
    }),
});
