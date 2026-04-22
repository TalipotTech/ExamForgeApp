import { z } from "zod";
import { and, avg, count, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  contentRatings,
  marketplaceListings,
  marketplacePurchases,
} from "@examforge/shared/db/schema";
import { rateListingSchema } from "@examforge/shared/validators";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";

export const contentRatingRouter = router({
  listByListing: publicProcedure
    .input(
      z.object({
        listingId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      return ctx.db
        .select()
        .from(contentRatings)
        .where(eq(contentRatings.listingId, input.listingId))
        .orderBy(desc(contentRatings.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  rateListing: protectedProcedure.input(rateListingSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");

    const [purchase] = await ctx.db
      .select({ id: marketplacePurchases.id })
      .from(marketplacePurchases)
      .where(
        and(
          eq(marketplacePurchases.listingId, input.listingId),
          eq(marketplacePurchases.buyerId, ctx.userId),
          eq(marketplacePurchases.status, "paid"),
        ),
      )
      .limit(1);
    if (!purchase) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only verified buyers can rate this listing",
      });
    }

    await ctx.db
      .insert(contentRatings)
      .values({
        listingId: input.listingId,
        userId: ctx.userId,
        rating: input.rating,
        reviewTitle: input.reviewTitle,
        reviewText: input.reviewText,
        isVerifiedPurchase: "true",
      })
      .onConflictDoUpdate({
        target: [contentRatings.listingId, contentRatings.userId],
        set: {
          rating: input.rating,
          reviewTitle: input.reviewTitle,
          reviewText: input.reviewText,
          updatedAt: new Date(),
        },
      });

    const [agg] = await ctx.db
      .select({
        avgRating: avg(contentRatings.rating),
        totalRatings: count(contentRatings.id),
      })
      .from(contentRatings)
      .where(eq(contentRatings.listingId, input.listingId));

    if (agg) {
      await ctx.db
        .update(marketplaceListings)
        .set({
          avgRating: agg.avgRating ? Number(agg.avgRating) : 0,
          totalRatings: Number(agg.totalRatings ?? 0),
          updatedAt: new Date(),
        })
        .where(eq(marketplaceListings.id, input.listingId));
    }

    return { success: true };
  }),

  myRatingForListing: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      const [rating] = await ctx.db
        .select()
        .from(contentRatings)
        .where(
          and(eq(contentRatings.listingId, input.listingId), eq(contentRatings.userId, ctx.userId)),
        )
        .limit(1);
      return rating ?? null;
    }),
});
