import { z } from "zod";
import { eq } from "drizzle-orm";
import { creatorProfiles } from "@examforge/shared/db/schema";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { getFlag } from "../../services/feature-flags.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";

/**
 * Phase A — creator profile registration, browse, self lookup.
 * All write procedures are gated by `creators.registration_open`.
 * Read procedures surface the master flag so the frontend can hide UI.
 */
export const creatorRouter = router({
  status: publicProcedure.query(async ({ ctx }) => {
    const enabled = (await getFlag(ctx.db, "creators.enabled")) === true;
    const registrationOpen =
      enabled && (await getFlag(ctx.db, "creators.registration_open")) === true;
    return { enabled, registrationOpen };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    await assertCreatorsFeature(ctx.db, "creators.enabled");
    const [profile] = await ctx.db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, ctx.userId))
      .limit(1);
    return profile ?? null;
  }),

  register: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(2).max(255),
        bio: z.string().max(2000).optional(),
        institution: z.string().max(255).optional(),
        institutionType: z
          .enum(["independent", "institute", "student_creator", "publisher"])
          .optional(),
        qualification: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.registration_open");
      const [existing] = await ctx.db
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, ctx.userId))
        .limit(1);
      if (existing) {
        return { id: existing.id, alreadyRegistered: true };
      }
      const [created] = await ctx.db
        .insert(creatorProfiles)
        .values({
          userId: ctx.userId,
          displayName: input.displayName,
          bio: input.bio,
          institution: input.institution,
          institutionType: input.institutionType,
          qualification: input.qualification,
        })
        .returning({ id: creatorProfiles.id });
      if (!created) {
        throw new Error("Failed to create creator profile");
      }
      return { id: created.id, alreadyRegistered: false };
    }),
});
