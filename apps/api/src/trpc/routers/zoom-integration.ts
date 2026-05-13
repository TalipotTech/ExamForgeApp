import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { creatorProfiles, creatorZoomIntegrations } from "@examforge/shared/db/schema";
import type { Database } from "@examforge/shared/db";
import { router, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";
import { buildAuthorizeUrl, isZoomConfigured } from "../../services/zoom-client.js";

async function requireCreatorProfile(db: Database, userId: string): Promise<{ id: string }> {
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);
  if (!profile) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a registered creator" });
  }
  return profile;
}

export const zoomIntegrationRouter = router({
  /** Returns metadata about the creator's Zoom connection — never tokens. */
  status: protectedProcedure.query(async ({ ctx }) => {
    await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
    if (!isZoomConfigured()) {
      return {
        configured: false,
        connected: false,
        zoomAccountEmail: null,
        zoomAccountType: null,
        connectedAt: null,
        lastUsedAt: null,
        expiresAt: null,
      };
    }
    const profile = await requireCreatorProfile(ctx.db, ctx.userId);
    const [row] = await ctx.db
      .select({
        zoomAccountEmail: creatorZoomIntegrations.zoomAccountEmail,
        zoomAccountType: creatorZoomIntegrations.zoomAccountType,
        connectedAt: creatorZoomIntegrations.connectedAt,
        lastUsedAt: creatorZoomIntegrations.lastUsedAt,
        expiresAt: creatorZoomIntegrations.expiresAt,
      })
      .from(creatorZoomIntegrations)
      .where(eq(creatorZoomIntegrations.creatorId, profile.id))
      .limit(1);
    if (!row) {
      return {
        configured: true,
        connected: false,
        zoomAccountEmail: null,
        zoomAccountType: null,
        connectedAt: null,
        lastUsedAt: null,
        expiresAt: null,
      };
    }
    return {
      configured: true,
      connected: true,
      zoomAccountEmail: row.zoomAccountEmail,
      zoomAccountType: row.zoomAccountType,
      connectedAt: row.connectedAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    };
  }),

  /**
   * Returns the Zoom OAuth authorize URL the client should redirect the
   * browser to. State token is a random 32-byte base64 — the OAuth
   * callback route does the exchange + persist.
   */
  startConnect: protectedProcedure.mutation(async ({ ctx }) => {
    await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
    if (!isZoomConfigured()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Zoom integration is not configured on this server",
      });
    }
    await requireCreatorProfile(ctx.db, ctx.userId);
    const state = crypto.randomBytes(24).toString("base64url");
    const authUrl = buildAuthorizeUrl(state);
    return { authUrl, state };
  }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
    const profile = await requireCreatorProfile(ctx.db, ctx.userId);
    await ctx.db
      .delete(creatorZoomIntegrations)
      .where(eq(creatorZoomIntegrations.creatorId, profile.id));
    return { success: true as const };
  }),
});
