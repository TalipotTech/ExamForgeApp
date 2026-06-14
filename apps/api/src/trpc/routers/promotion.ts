import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { creatorProfiles, promotions } from "@examforge/shared/db/schema";
import { router, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";

export const promotionRouter = router({
  myPromotions: protectedProcedure
    .input(
      z
        .object({
          status: z.enum(["pending", "active", "paused", "completed", "rejected"]).optional(),
          limit: z.number().int().min(1).max(50).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.promotions_enabled");
      const [profile] = await ctx.db
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, ctx.userId))
        .limit(1);
      if (!profile) return [];
      const conds = [eq(promotions.creatorId, profile.id)];
      if (input?.status) {
        conds.push(eq(promotions.status, input.status));
      }
      return ctx.db
        .select()
        .from(promotions)
        .where(and(...conds))
        .orderBy(desc(promotions.createdAt))
        .limit(input?.limit ?? 20);
    }),
});
