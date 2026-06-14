import { eq } from "drizzle-orm";
import type { Database } from "@examforge/shared/db";
import { creatorZoomIntegrations } from "@examforge/shared/db/schema";
import {
  zoomCreateMeetingResponseSchema,
  zoomTokenResponseSchema,
  zoomUserMeSchema,
  type ZoomCreateMeetingResponse,
  type ZoomTokenResponse,
  type ZoomUserMe,
} from "@examforge/shared/validators";
import { decryptToken, encryptToken } from "./token-crypto.js";

const ZOOM_OAUTH_BASE = "https://zoom.us";
const ZOOM_API_BASE = "https://api.zoom.us/v2";

/** Refresh-window slack: refresh tokens that are within this many seconds
 *  of expiry to avoid mid-request 401s. */
const REFRESH_SLACK_SECONDS = 60;

function getOAuthCreds(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const redirectUri = process.env.ZOOM_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Zoom OAuth not configured — set ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_REDIRECT_URI.",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/** True iff the operator has wired Zoom OAuth env vars. UI should hide the
 *  Zoom radio entirely if this returns false. */
export function isZoomConfigured(): boolean {
  return Boolean(
    process.env.ZOOM_CLIENT_ID &&
    process.env.ZOOM_CLIENT_SECRET &&
    process.env.ZOOM_REDIRECT_URI &&
    process.env.ZOOM_TOKEN_ENCRYPTION_KEY,
  );
}

export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getOAuthCreds();
  const url = new URL(`${ZOOM_OAUTH_BASE}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

async function postOAuthToken(params: URLSearchParams): Promise<ZoomTokenResponse> {
  const { clientId, clientSecret } = getOAuthCreds();
  const res = await fetch(`${ZOOM_OAUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zoom token endpoint ${res.status}: ${err}`);
  }
  return zoomTokenResponseSchema.parse(await res.json());
}

export async function exchangeAuthCode(code: string): Promise<ZoomTokenResponse> {
  const { redirectUri } = getOAuthCreds();
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  return postOAuthToken(params);
}

async function refreshAccessToken(refreshToken: string): Promise<ZoomTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return postOAuthToken(params);
}

export async function fetchZoomUser(accessToken: string): Promise<ZoomUserMe> {
  const res = await fetch(`${ZOOM_API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zoom GET /users/me ${res.status}: ${err}`);
  }
  return zoomUserMeSchema.parse(await res.json());
}

/** Translate Zoom's numeric `type` field on `users/me` into our enum. */
export function zoomTypeToAccountType(t?: number): string {
  if (t === 1) return "basic";
  if (t === 2) return "pro";
  if (t === 3) return "business";
  return "unknown";
}

/**
 * Returns a valid access token for the creator, refreshing + persisting
 * if needed. Throws if the integration row does not exist or refresh fails
 * (caller should catch and surface a "reconnect" prompt).
 */
async function getAccessTokenForCreator(db: Database, creatorId: string): Promise<string> {
  const [row] = await db
    .select()
    .from(creatorZoomIntegrations)
    .where(eq(creatorZoomIntegrations.creatorId, creatorId))
    .limit(1);
  if (!row) {
    throw new Error("ZOOM_NOT_CONNECTED");
  }
  const expiresInSec = Math.floor((row.expiresAt.getTime() - Date.now()) / 1000);
  if (expiresInSec > REFRESH_SLACK_SECONDS) {
    return decryptToken(row.accessTokenEncrypted);
  }
  // Refresh.
  const refreshToken = decryptToken(row.refreshTokenEncrypted);
  const fresh = await refreshAccessToken(refreshToken);
  const newExpiresAt = new Date(Date.now() + fresh.expires_in * 1000);
  await db
    .update(creatorZoomIntegrations)
    .set({
      accessTokenEncrypted: encryptToken(fresh.access_token),
      refreshTokenEncrypted: encryptToken(fresh.refresh_token),
      expiresAt: newExpiresAt,
      scopes: fresh.scope,
      lastUsedAt: new Date(),
    })
    .where(eq(creatorZoomIntegrations.creatorId, creatorId));
  return fresh.access_token;
}

export type CreateMeetingInput = {
  title: string;
  description?: string;
  scheduledAt: Date;
  durationMinutes: number;
  autoRecord: boolean;
  muteOnEntry: boolean;
  waitingRoom: boolean;
};

/**
 * Create a Zoom meeting on behalf of the connected creator. Returns the
 * Zoom-generated `id`, `join_url`, `password`. Caller persists into
 * live_sessions.
 */
export async function createZoomMeeting(
  db: Database,
  creatorId: string,
  input: CreateMeetingInput,
): Promise<ZoomCreateMeetingResponse> {
  const accessToken = await getAccessTokenForCreator(db, creatorId);
  // Zoom expects ISO 8601 in UTC ending in `Z`.
  const startTime = new Date(input.scheduledAt).toISOString();
  const body = {
    topic: input.title.slice(0, 200),
    type: 2, // scheduled meeting
    start_time: startTime,
    duration: input.durationMinutes,
    timezone: "UTC",
    agenda: input.description?.slice(0, 2000),
    settings: {
      host_video: true,
      participant_video: false,
      mute_upon_entry: input.muteOnEntry,
      waiting_room: input.waitingRoom,
      auto_recording: input.autoRecord ? "cloud" : "none",
      join_before_host: false,
    },
  };
  const res = await fetch(`${ZOOM_API_BASE}/users/me/meetings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zoom POST /users/me/meetings ${res.status}: ${err}`);
  }
  await db
    .update(creatorZoomIntegrations)
    .set({ lastUsedAt: new Date() })
    .where(eq(creatorZoomIntegrations.creatorId, creatorId));
  return zoomCreateMeetingResponseSchema.parse(await res.json());
}
