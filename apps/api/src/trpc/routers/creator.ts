import { z } from "zod";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@examforge/shared/db";
import { classrooms, creatorContent, creatorProfiles } from "@examforge/shared/db/schema";
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
      const slug = await deriveUniqueSlug(ctx.db, input.displayName);
      const [created] = await ctx.db
        .insert(creatorProfiles)
        .values({
          userId: ctx.userId,
          displayName: input.displayName,
          slug,
          bio: input.bio,
          institution: input.institution,
          institutionType: input.institutionType,
          qualification: input.qualification,
        })
        .returning({ id: creatorProfiles.id });
      if (!created) {
        throw new Error("Failed to create creator profile");
      }
      return { id: created.id, alreadyRegistered: false, slug };
    }),

  /**
   * Public directory listing. No auth. Surfaces only verified/featured
   * active creators. Featured rows are always pinned ahead of the chosen
   * sort.
   */
  listPublic: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(48).default(24),
        offset: z.number().int().min(0).default(0),
        // Free-form exam token: matches an entry in `examsCovered` JSONB
        // array (slug like "bpharm" or UUID — whatever the creator stored).
        examId: z.string().trim().min(1).max(80).optional(),
        search: z.string().trim().min(1).max(100).optional(),
        sort: z.enum(["featured", "rating", "newest"]).default("featured"),
        verifiedOnly: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const visibilityCond = input.verifiedOnly
        ? eq(creatorProfiles.verificationStatus, "verified")
        : or(
            eq(creatorProfiles.verificationStatus, "verified"),
            eq(creatorProfiles.verificationStatus, "featured"),
          );

      const conds = [eq(creatorProfiles.isActive, true)];
      if (visibilityCond) conds.push(visibilityCond);

      if (input.search) {
        const term = `%${input.search}%`;
        const searchCond = or(
          ilike(creatorProfiles.displayName, term),
          ilike(creatorProfiles.institution, term),
          sql`${creatorProfiles.specializations} ?| array[${input.search.toLowerCase()}]`,
        );
        if (searchCond) conds.push(searchCond);
      }

      if (input.examId) {
        conds.push(sql`${creatorProfiles.examsCovered} ?| array[${input.examId}]`);
      }

      const orderClauses =
        input.sort === "rating"
          ? [
              desc(creatorProfiles.isFeatured),
              desc(creatorProfiles.averageRating),
              desc(creatorProfiles.totalRatings),
            ]
          : input.sort === "newest"
            ? [desc(creatorProfiles.isFeatured), desc(creatorProfiles.createdAt)]
            : [
                desc(creatorProfiles.isFeatured),
                desc(creatorProfiles.followerCount),
                desc(creatorProfiles.averageRating),
              ];

      const rows = await ctx.db
        .select({
          id: creatorProfiles.id,
          slug: creatorProfiles.slug,
          displayName: creatorProfiles.displayName,
          avatarUrl: creatorProfiles.avatarUrl,
          coverImageUrl: creatorProfiles.coverImageUrl,
          institution: creatorProfiles.institution,
          institutionType: creatorProfiles.institutionType,
          qualification: creatorProfiles.qualification,
          bio: creatorProfiles.bio,
          specializations: creatorProfiles.specializations,
          examsCovered: creatorProfiles.examsCovered,
          verificationStatus: creatorProfiles.verificationStatus,
          isFeatured: creatorProfiles.isFeatured,
          followerCount: creatorProfiles.followerCount,
          contentCount: creatorProfiles.contentCount,
          averageRating: creatorProfiles.averageRating,
          totalRatings: creatorProfiles.totalRatings,
          createdAt: creatorProfiles.createdAt,
        })
        .from(creatorProfiles)
        .where(and(...conds))
        .orderBy(...orderClauses)
        .limit(input.limit)
        .offset(input.offset);

      const totalRows = await ctx.db
        .select({ total: sql<number>`count(*)::int` })
        .from(creatorProfiles)
        .where(and(...conds));
      const total = Number(totalRows[0]?.total ?? 0);

      return {
        items: rows,
        total,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  /**
   * Public detail. Returns profile + top-12 published content + public
   * (free, active) classrooms so visitors can preview before signing up.
   */
  bySlug: publicProcedure
    .input(z.object({ slug: z.string().trim().min(1).max(280) }))
    .query(async ({ ctx, input }) => {
      const visibilityCond = or(
        eq(creatorProfiles.verificationStatus, "verified"),
        eq(creatorProfiles.verificationStatus, "featured"),
      );

      const baseConds = [eq(creatorProfiles.slug, input.slug), eq(creatorProfiles.isActive, true)];
      if (visibilityCond) baseConds.push(visibilityCond);

      const [profile] = await ctx.db
        .select()
        .from(creatorProfiles)
        .where(and(...baseConds))
        .limit(1);

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Creator not found",
        });
      }

      const content = await ctx.db
        .select({
          id: creatorContent.id,
          title: creatorContent.title,
          contentType: creatorContent.contentType,
          isPublished: creatorContent.isPublished,
          viewCount: creatorContent.viewCount,
          createdAt: creatorContent.createdAt,
          thumbnailUrl: creatorContent.thumbnailUrl,
          metadata: creatorContent.metadata,
          subject: creatorContent.subject,
          topic: creatorContent.topic,
        })
        .from(creatorContent)
        .where(and(eq(creatorContent.creatorId, profile.id), eq(creatorContent.isPublished, true)))
        .orderBy(desc(creatorContent.publishedAt))
        .limit(12);

      const publicClassrooms = await ctx.db
        .select({
          id: classrooms.id,
          name: classrooms.name,
          description: classrooms.description,
          subject: classrooms.subject,
          examId: classrooms.examId,
          studentCount: classrooms.studentCount,
          maxStudents: classrooms.maxStudents,
          joinCode: classrooms.joinCode,
          isPaid: classrooms.isPaid,
          createdAt: classrooms.createdAt,
        })
        .from(classrooms)
        .where(
          and(
            eq(classrooms.creatorId, profile.id),
            eq(classrooms.isActive, true),
            eq(classrooms.isPaid, false),
          ),
        )
        .orderBy(asc(classrooms.createdAt))
        .limit(8);

      return {
        profile: {
          id: profile.id,
          slug: profile.slug,
          displayName: profile.displayName,
          bio: profile.bio,
          avatarUrl: profile.avatarUrl,
          coverImageUrl: profile.coverImageUrl,
          institution: profile.institution,
          institutionType: profile.institutionType,
          qualification: profile.qualification,
          specializations: profile.specializations,
          examsCovered: profile.examsCovered,
          verificationStatus: profile.verificationStatus,
          isFeatured: profile.isFeatured,
          followerCount: profile.followerCount,
          contentCount: profile.contentCount,
          averageRating: profile.averageRating,
          totalRatings: profile.totalRatings,
          websiteUrl: profile.websiteUrl,
          youtubeUrl: profile.youtubeUrl,
          socialLinks: profile.socialLinks,
          createdAt: profile.createdAt,
        },
        content,
        classrooms: publicClassrooms,
      };
    }),
});

// ─── helpers ─────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 240);
}

async function deriveUniqueSlug(db: Database, displayName: string): Promise<string> {
  const base = slugify(displayName) || "creator";
  let candidate = base;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const [hit] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.slug, candidate))
      .limit(1);
    if (!hit) return candidate;
    candidate = `${base}-${attempt + 2}`;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
