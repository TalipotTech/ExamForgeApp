import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { creatorContent, creatorProfiles } from "@examforge/shared/db/schema";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";

/**
 * Phase A — list a creator's published content + minimal self-listing for the
 * creator dashboard. Upload/publish flows live in Phases B–C and are not wired
 * up yet; attempts to call them will be blocked by the gate.
 */
export const creatorContentRouter = router({
  listByCreator: publicProcedure
    .input(
      z.object({
        creatorId: z.string().uuid(),
        contentType: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.enabled");
      const conds = [
        eq(creatorContent.creatorId, input.creatorId),
        eq(creatorContent.isPublished, true),
      ];
      if (input.contentType) {
        conds.push(eq(creatorContent.contentType, input.contentType));
      }
      return ctx.db
        .select()
        .from(creatorContent)
        .where(and(...conds))
        .orderBy(desc(creatorContent.publishedAt))
        .limit(input.limit);
    }),

  myContent: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.enabled");
      const [profile] = await ctx.db
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, ctx.userId))
        .limit(1);
      if (!profile) return [];
      return ctx.db
        .select()
        .from(creatorContent)
        .where(eq(creatorContent.creatorId, profile.id))
        .orderBy(desc(creatorContent.createdAt))
        .limit(input?.limit ?? 50);
    }),
});
