import { z } from "zod";
import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  creatorProfiles,
  marketplaceListings,
  marketplacePurchases,
} from "@examforge/shared/db/schema";
import {
  createMarketplaceListingSchema,
  updateMarketplaceListingSchema,
  marketplaceBrowseFilterSchema,
  createPurchaseOrderSchema,
  verifyPurchaseSchema,
} from "@examforge/shared/validators";
import type { Database } from "@examforge/shared/db";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";
import {
  createMarketplacePurchaseOrder,
  verifyAndFulfillMarketplacePurchase,
} from "../../services/marketplace-purchase.js";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 500);
}

async function getCallerCreatorProfile(db: Database, userId: string): Promise<{ id: string }> {
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);
  if (!profile) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Caller is not a registered creator" });
  }
  return profile;
}

export const marketplaceRouter = router({
  browse: publicProcedure
    .input(marketplaceBrowseFilterSchema.optional())
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      const filter = input ?? marketplaceBrowseFilterSchema.parse({});
      const conds: SQL[] = [
        eq(marketplaceListings.isPublished, true),
        eq(marketplaceListings.status, "active"),
      ];
      if (filter.examId) conds.push(eq(marketplaceListings.examId, filter.examId));
      if (filter.listingType) conds.push(eq(marketplaceListings.listingType, filter.listingType));
      if (filter.search) {
        const pattern = `%${filter.search}%`;
        const clause = or(
          ilike(marketplaceListings.title, pattern),
          ilike(marketplaceListings.description, pattern),
        );
        if (clause) conds.push(clause);
      }

      let orderBy;
      switch (filter.sort) {
        case "price_asc":
          orderBy = asc(marketplaceListings.priceInr);
          break;
        case "price_desc":
          orderBy = desc(marketplaceListings.priceInr);
          break;
        case "popular":
          orderBy = desc(marketplaceListings.purchaseCount);
          break;
        case "rating":
          orderBy = desc(marketplaceListings.avgRating);
          break;
        case "newest":
        default:
          orderBy = desc(marketplaceListings.publishedAt);
      }

      return ctx.db
        .select()
        .from(marketplaceListings)
        .where(and(...conds))
        .orderBy(orderBy)
        .limit(filter.limit)
        .offset(filter.offset);
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(600) }))
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      const [listing] = await ctx.db
        .select()
        .from(marketplaceListings)
        .where(eq(marketplaceListings.slug, input.slug))
        .limit(1);
      return listing ?? null;
    }),

  getById: publicProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      const [listing] = await ctx.db
        .select()
        .from(marketplaceListings)
        .where(eq(marketplaceListings.id, input.listingId))
        .limit(1);
      return listing ?? null;
    }),

  createListing: protectedProcedure
    .input(createMarketplaceListingSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      const profile = await getCallerCreatorProfile(ctx.db, ctx.userId);
      const baseSlug = slugify(input.title) || "listing";
      const slug = `${baseSlug}-${Date.now().toString(36)}`;
      const [listing] = await ctx.db
        .insert(marketplaceListings)
        .values({
          creatorId: profile.id,
          title: input.title,
          description: input.description,
          contentId: input.contentId,
          listingType: input.listingType,
          priceInr: input.priceInr,
          compareAtPriceInr: input.compareAtPriceInr,
          examId: input.examId,
          subject: input.subject,
          tags: input.tags ?? [],
          coverImageUrl: input.coverImageUrl,
          previewContent: input.previewContent,
          previewUrl: input.previewUrl,
          slug,
          status: "draft",
          isPublished: false,
        })
        .returning({ id: marketplaceListings.id, slug: marketplaceListings.slug });
      if (!listing) {
        throw new Error("Failed to create listing");
      }
      return listing;
    }),

  updateListing: protectedProcedure
    .input(updateMarketplaceListingSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      const profile = await getCallerCreatorProfile(ctx.db, ctx.userId);
      const { listingId, ...fields } = input;
      const [existing] = await ctx.db
        .select({ id: marketplaceListings.id, creatorId: marketplaceListings.creatorId })
        .from(marketplaceListings)
        .where(eq(marketplaceListings.id, listingId))
        .limit(1);
      if (!existing || existing.creatorId !== profile.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
      }
      await ctx.db
        .update(marketplaceListings)
        .set({
          ...fields,
          tags: fields.tags,
          updatedAt: new Date(),
        })
        .where(eq(marketplaceListings.id, listingId));
      return { success: true };
    }),

  publish: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      const profile = await getCallerCreatorProfile(ctx.db, ctx.userId);
      const [existing] = await ctx.db
        .select()
        .from(marketplaceListings)
        .where(eq(marketplaceListings.id, input.listingId))
        .limit(1);
      if (!existing || existing.creatorId !== profile.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
      }
      if (existing.priceInr <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Listing must have a positive price before publishing",
        });
      }
      const now = new Date();
      await ctx.db
        .update(marketplaceListings)
        .set({
          status: "active",
          isPublished: true,
          publishedAt: existing.publishedAt ?? now,
          updatedAt: now,
        })
        .where(eq(marketplaceListings.id, input.listingId));
      return { success: true };
    }),

  unpublish: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      const profile = await getCallerCreatorProfile(ctx.db, ctx.userId);
      const [existing] = await ctx.db
        .select({ id: marketplaceListings.id, creatorId: marketplaceListings.creatorId })
        .from(marketplaceListings)
        .where(eq(marketplaceListings.id, input.listingId))
        .limit(1);
      if (!existing || existing.creatorId !== profile.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
      }
      await ctx.db
        .update(marketplaceListings)
        .set({ status: "paused", isPublished: false, updatedAt: new Date() })
        .where(eq(marketplaceListings.id, input.listingId));
      return { success: true };
    }),

  myListings: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
          status: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      const profile = await getCallerCreatorProfile(ctx.db, ctx.userId);
      const conds: SQL[] = [eq(marketplaceListings.creatorId, profile.id)];
      if (input?.status) conds.push(eq(marketplaceListings.status, input.status));
      return ctx.db
        .select()
        .from(marketplaceListings)
        .where(and(...conds))
        .orderBy(desc(marketplaceListings.createdAt))
        .limit(input?.limit ?? 50);
    }),

  createPurchaseOrder: protectedProcedure
    .input(createPurchaseOrderSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      return createMarketplacePurchaseOrder(ctx.db, ctx.userId, input.listingId);
    }),

  verifyPurchase: protectedProcedure
    .input(verifyPurchaseSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      return verifyAndFulfillMarketplacePurchase(ctx.db, ctx.userId, {
        razorpayOrderId: input.razorpayOrderId,
        razorpayPaymentId: input.razorpayPaymentId,
        razorpaySignature: input.razorpaySignature,
      });
    }),

  myPurchases: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      return ctx.db
        .select()
        .from(marketplacePurchases)
        .where(
          and(
            eq(marketplacePurchases.buyerId, ctx.userId),
            eq(marketplacePurchases.status, "paid"),
          ),
        )
        .orderBy(desc(marketplacePurchases.purchasedAt))
        .limit(input?.limit ?? 50);
    }),
});
