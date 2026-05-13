/**
 * GET /api/integrations/zoom/callback?code=...&state=...
 *
 * Final hop of the user-managed OAuth flow:
 *   1. Caller (the creator) is signed in to ExamForge.
 *   2. Their browser was redirected to Zoom's authorize URL by
 *      `zoomIntegration.startConnect`.
 *   3. Zoom redirects them back here with `?code` if they approved.
 *
 * We exchange the code for {access, refresh}, fetch the Zoom user identity
 * to capture email + plan tier, encrypt both tokens, and upsert into
 * `creator_zoom_integrations` (one row per creator).
 *
 * On any failure we redirect back to /creator/integrations with
 * `?error=<reason>` so the page can render an inline notice. We never
 * surface raw token strings or exception messages to the browser.
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createDatabase } from "@examforge/shared/db";
import { creatorProfiles, creatorZoomIntegrations } from "@examforge/shared/db/schema";
import { eq } from "drizzle-orm";
import { encryptZoomToken } from "@/lib/zoom-token-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZOOM_OAUTH_BASE = "https://zoom.us";
const ZOOM_API_BASE = "https://api.zoom.us/v2";
const APP_URL = process.env.APP_URL ?? "http://localhost:3100";

function redirectBack(reason: string): NextResponse {
  return NextResponse.redirect(`${APP_URL}/creator/integrations?${reason}`);
}

function zoomTypeToAccountType(t?: number): string {
  if (t === 1) return "basic";
  if (t === 2) return "pro";
  if (t === 3) return "business";
  return "unknown";
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const errorParam = url.searchParams.get("error");
    if (errorParam) {
      return redirectBack(`error=zoom_${encodeURIComponent(errorParam)}`);
    }
    if (!code) {
      return redirectBack("error=zoom_missing_code");
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.redirect(
        `${APP_URL}/auth/sign-in?next=${encodeURIComponent("/creator/integrations")}`,
      );
    }
    const userId = session.user.id;

    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    const redirectUri = process.env.ZOOM_REDIRECT_URI;
    const databaseUrl = process.env.DATABASE_URL;
    if (!clientId || !clientSecret || !redirectUri || !databaseUrl) {
      console.error(
        "[zoom-callback] missing env (ZOOM_CLIENT_ID/SECRET/REDIRECT_URI/DATABASE_URL)",
      );
      return redirectBack("error=zoom_not_configured");
    }

    // 1. Exchange the code.
    const tokenRes = await fetch(`${ZOOM_OAUTH_BASE}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });
    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("[zoom-callback] token exchange failed", tokenRes.status, errBody);
      return redirectBack("error=zoom_exchange_failed");
    }
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!tokenJson.access_token || !tokenJson.refresh_token || !tokenJson.expires_in) {
      console.error("[zoom-callback] malformed token response");
      return redirectBack("error=zoom_bad_token_payload");
    }

    // 2. Fetch the Zoom user identity.
    const meRes = await fetch(`${ZOOM_API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!meRes.ok) {
      const errBody = await meRes.text();
      console.error("[zoom-callback] users/me failed", meRes.status, errBody);
      return redirectBack("error=zoom_identity_failed");
    }
    const me = (await meRes.json()) as { id?: string; email?: string; type?: number };
    if (!me.id) {
      return redirectBack("error=zoom_no_user_id");
    }

    // 3. Resolve the calling user's creator profile.
    const db = createDatabase(databaseUrl);
    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);
    if (!profile) {
      return redirectBack("error=not_a_creator");
    }

    // 4. Upsert the integration row (unique on creator_id).
    const expiresAt = new Date(Date.now() + tokenJson.expires_in * 1000);
    const accessTokenEncrypted = encryptZoomToken(tokenJson.access_token);
    const refreshTokenEncrypted = encryptZoomToken(tokenJson.refresh_token);

    await db
      .insert(creatorZoomIntegrations)
      .values({
        creatorId: profile.id,
        zoomUserId: me.id,
        zoomAccountEmail: me.email ?? null,
        zoomAccountType: zoomTypeToAccountType(me.type),
        accessTokenEncrypted,
        refreshTokenEncrypted,
        expiresAt,
        scopes: tokenJson.scope ?? "",
        lastUsedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: creatorZoomIntegrations.creatorId,
        set: {
          zoomUserId: me.id,
          zoomAccountEmail: me.email ?? null,
          zoomAccountType: zoomTypeToAccountType(me.type),
          accessTokenEncrypted,
          refreshTokenEncrypted,
          expiresAt,
          scopes: tokenJson.scope ?? "",
          connectedAt: new Date(),
          lastUsedAt: new Date(),
        },
      });

    return redirectBack("connected=zoom");
  } catch (err) {
    console.error("[zoom-callback] unexpected error", err);
    return redirectBack("error=zoom_unexpected");
  }
}
