import { z } from "zod";
import { and, desc, eq, gt, inArray, lt, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@examforge/shared/db";
import { adminAuditLog, creatorProfiles, promotions, users } from "@examforge/shared/db/schema";
import { router, protectedProcedure, adminProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";
import { createAuditEntry } from "../../services/audit-log.js";

const promotionIdInput = z.object({ promotionId: z.string().uuid() });

async function loadPromotion(
  db: Database,
  promotionId: string,
): Promise<typeof promotions.$inferSelect> {
  const [row] = await db.select().from(promotions).where(eq(promotions.id, promotionId)).limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Promotion not found" });
  }
  return row;
}

const adminListColumns = {
  id: promotions.id,
  creatorId: promotions.creatorId,
  promotionType: promotions.promotionType,
  contentId: promotions.contentId,
  listingId: promotions.listingId,
  classroomId: promotions.classroomId,
  bannerImageUrl: promotions.bannerImageUrl,
  headline: promotions.headline,
  description: promotions.description,
  ctaText: promotions.ctaText,
  ctaUrl: promotions.ctaUrl,
  targetExams: promotions.targetExams,
  targetSubjects: promotions.targetSubjects,
  budgetType: promotions.budgetType,
  budgetAmountInr: promotions.budgetAmountInr,
  spentAmountInr: promotions.spentAmountInr,
  impressions: promotions.impressions,
  clicks: promotions.clicks,
  conversions: promotions.conversions,
  startsAt: promotions.startsAt,
  endsAt: promotions.endsAt,
  status: promotions.status,
  approvedBy: promotions.approvedBy,
  createdAt: promotions.createdAt,
  creatorDisplayName: creatorProfiles.displayName,
  creatorAvatarUrl: creatorProfiles.avatarUrl,
} as const;

export const promotionRouter = router({
  myPromotions: protectedProcedure
    .input(
      z
        .object({
          status: z
            .enum(["pending", "active", "paused", "completed", "expired", "rejected"])
            .optional(),
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

  listPending: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      return ctx.db
        .select(adminListColumns)
        .from(promotions)
        .leftJoin(creatorProfiles, eq(creatorProfiles.id, promotions.creatorId))
        .where(eq(promotions.status, "pending"))
        .orderBy(desc(promotions.createdAt))
        .limit(limit);
    }),

  listActive: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const now = new Date();
      return ctx.db
        .select(adminListColumns)
        .from(promotions)
        .leftJoin(creatorProfiles, eq(creatorProfiles.id, promotions.creatorId))
        .where(and(inArray(promotions.status, ["active", "paused"]), gt(promotions.endsAt, now)))
        .orderBy(desc(promotions.createdAt))
        .limit(limit);
    }),

  listExpired: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const now = new Date();
      return ctx.db
        .select(adminListColumns)
        .from(promotions)
        .leftJoin(creatorProfiles, eq(creatorProfiles.id, promotions.creatorId))
        .where(
          or(
            inArray(promotions.status, ["expired", "completed"]),
            and(inArray(promotions.status, ["active", "paused"]), lt(promotions.endsAt, now)),
          ),
        )
        .orderBy(desc(promotions.endsAt))
        .limit(limit);
    }),

  listRejected: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const rows = await ctx.db
        .select(adminListColumns)
        .from(promotions)
        .leftJoin(creatorProfiles, eq(creatorProfiles.id, promotions.creatorId))
        .where(eq(promotions.status, "rejected"))
        .orderBy(desc(promotions.createdAt))
        .limit(limit);

      if (rows.length === 0) return [];

      const ids = rows.map((row) => row.id);
      const auditRows = await ctx.db
        .select({
          targetId: adminAuditLog.targetId,
          details: adminAuditLog.details,
          createdAt: adminAuditLog.createdAt,
          adminName: users.name,
        })
        .from(adminAuditLog)
        .leftJoin(users, eq(users.id, adminAuditLog.adminId))
        .where(
          and(
            eq(adminAuditLog.targetType, "promotion"),
            eq(adminAuditLog.action, "promotion.reject"),
            inArray(adminAuditLog.targetId, ids),
          ),
        )
        .orderBy(desc(adminAuditLog.createdAt));

      const reasonByPromotion = new Map<
        string,
        { reason: string; rejectedAt: Date; adminName: string | null }
      >();
      for (const entry of auditRows) {
        if (!entry.targetId || reasonByPromotion.has(entry.targetId)) continue;
        const reason = (entry.details?.reason ?? "").toString();
        reasonByPromotion.set(entry.targetId, {
          reason,
          rejectedAt: entry.createdAt,
          adminName: entry.adminName ?? null,
        });
      }

      return rows.map((row) => ({
        ...row,
        rejection: reasonByPromotion.get(row.id) ?? null,
      }));
    }),

  approve: adminProcedure
    .input(promotionIdInput.extend({ notes: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await loadPromotion(ctx.db, input.promotionId);
      if (existing.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot approve a promotion in status '${existing.status}'`,
        });
      }

      await ctx.db
        .update(promotions)
        .set({ status: "active", approvedBy: ctx.userId })
        .where(eq(promotions.id, input.promotionId));

      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "promotion.approve",
        targetType: "promotion",
        targetId: input.promotionId,
        details: {
          before: { status: existing.status },
          after: { status: "active", approvedBy: ctx.userId },
          ...(input.notes ? { reason: input.notes } : {}),
        },
      });

      return { success: true };
    }),

  reject: adminProcedure
    .input(promotionIdInput.extend({ reason: z.string().min(3).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await loadPromotion(ctx.db, input.promotionId);
      if (existing.status === "rejected") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Promotion is already rejected",
        });
      }

      await ctx.db
        .update(promotions)
        .set({ status: "rejected" })
        .where(eq(promotions.id, input.promotionId));

      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "promotion.reject",
        targetType: "promotion",
        targetId: input.promotionId,
        details: {
          before: { status: existing.status },
          after: { status: "rejected" },
          reason: input.reason,
        },
      });

      return { success: true };
    }),

  pause: adminProcedure.input(promotionIdInput).mutation(async ({ ctx, input }) => {
    const existing = await loadPromotion(ctx.db, input.promotionId);
    if (existing.status !== "active") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Only active promotions can be paused (current: '${existing.status}')`,
      });
    }

    await ctx.db
      .update(promotions)
      .set({ status: "paused" })
      .where(eq(promotions.id, input.promotionId));

    await createAuditEntry(ctx.db, {
      adminId: ctx.userId,
      action: "promotion.pause",
      targetType: "promotion",
      targetId: input.promotionId,
      details: { before: { status: "active" }, after: { status: "paused" } },
    });

    return { success: true };
  }),

  resume: adminProcedure.input(promotionIdInput).mutation(async ({ ctx, input }) => {
    const existing = await loadPromotion(ctx.db, input.promotionId);
    if (existing.status !== "paused") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Only paused promotions can be resumed (current: '${existing.status}')`,
      });
    }

    await ctx.db
      .update(promotions)
      .set({ status: "active" })
      .where(eq(promotions.id, input.promotionId));

    await createAuditEntry(ctx.db, {
      adminId: ctx.userId,
      action: "promotion.resume",
      targetType: "promotion",
      targetId: input.promotionId,
      details: { before: { status: "paused" }, after: { status: "active" } },
    });

    return { success: true };
  }),

  getMetrics: adminProcedure.input(promotionIdInput).query(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select({
        id: promotions.id,
        headline: promotions.headline,
        promotionType: promotions.promotionType,
        status: promotions.status,
        startsAt: promotions.startsAt,
        endsAt: promotions.endsAt,
        budgetType: promotions.budgetType,
        budgetAmountInr: promotions.budgetAmountInr,
        spentAmountInr: promotions.spentAmountInr,
        impressions: promotions.impressions,
        clicks: promotions.clicks,
        conversions: promotions.conversions,
        creatorDisplayName: creatorProfiles.displayName,
      })
      .from(promotions)
      .leftJoin(creatorProfiles, eq(creatorProfiles.id, promotions.creatorId))
      .where(eq(promotions.id, input.promotionId))
      .limit(1);
    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Promotion not found" });
    }

    const impressions = row.impressions ?? 0;
    const clicks = row.clicks ?? 0;
    const conversions = row.conversions ?? 0;
    const ctr = impressions > 0 ? clicks / impressions : 0;
    const conversionRate = clicks > 0 ? conversions / clicks : 0;
    const budget = row.budgetAmountInr ?? 0;
    const spent = row.spentAmountInr ?? 0;
    const budgetUsedPct = budget > 0 ? Math.min(spent / budget, 1) : 0;

    const recentActions = await ctx.db
      .select({
        id: adminAuditLog.id,
        action: adminAuditLog.action,
        details: adminAuditLog.details,
        createdAt: adminAuditLog.createdAt,
        adminName: users.name,
      })
      .from(adminAuditLog)
      .leftJoin(users, eq(users.id, adminAuditLog.adminId))
      .where(
        and(
          eq(adminAuditLog.targetType, "promotion"),
          eq(adminAuditLog.targetId, input.promotionId),
        ),
      )
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(20);

    return {
      ...row,
      derived: {
        ctr,
        conversionRate,
        budgetUsedPct,
        budgetRemainingInr: Math.max(budget - spent, 0),
      },
      recentActions,
    };
  }),
});
