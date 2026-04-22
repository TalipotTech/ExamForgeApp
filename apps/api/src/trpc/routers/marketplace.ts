import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { marketplaceListings } from "@examforge/shared/db/schema";
import { router, publicProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";

export const marketplaceRouter = router({
  browse: publicProcedure
    .input(
      z
        .object({
          examId: z.string().uuid().optional(),
          search: z.string().max(255).optional(),
          limit: z.number().int().min(1).max(50).default(20),
          offset: z.number().int().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.marketplace_enabled");
      const conds = [
        eq(marketplaceListings.isPublished, true),
        eq(marketplaceListings.status, "active"),
      ];
      if (input?.examId) {
        conds.push(eq(marketplaceListings.examId, input.examId));
      }
      if (input?.search) {
        const pattern = `%${input.search}%`;
        const clause = or(
          ilike(marketplaceListings.title, pattern),
          ilike(marketplaceListings.description, pattern),
        );
        if (clause) conds.push(clause);
      }
      return ctx.db
        .select()
        .from(marketplaceListings)
        .where(and(...conds))
        .orderBy(desc(marketplaceListings.publishedAt))
        .limit(input?.limit ?? 20)
        .offset(input?.offset ?? 0);
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
});
