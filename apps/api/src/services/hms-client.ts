/**
 * 100ms (live.100ms.live) REST client + management-token signer.
 *
 * 100ms uses two flavors of JWT:
 *   - "management" tokens — short-lived, signed with the app secret, used
 *     for server→100ms REST calls (creating rooms, etc).
 *   - "auth" tokens — issued to end users, embed room_id + user_id + role,
 *     used by the browser SDK to join a specific room. See `hms-token.ts`.
 *
 * This module owns ROOM creation. Token issuance for end users lives in
 * `hms-token.ts` so the two concerns stay separated.
 */

import jwt from "jsonwebtoken";

const HMS_API_BASE = process.env.HMS_API_BASE ?? "https://api.100ms.live/v2";

/** Truthy iff every env var the embedded provider needs is present. UI
 *  surfaces the radio only when this returns true. */
export function isHmsConfigured(): boolean {
  return Boolean(
    process.env.HMS_APP_ACCESS_KEY && process.env.HMS_APP_SECRET && process.env.HMS_TEMPLATE_ID,
  );
}

function getCreds(): { accessKey: string; appSecret: string; templateId: string } {
  const accessKey = process.env.HMS_APP_ACCESS_KEY;
  const appSecret = process.env.HMS_APP_SECRET;
  const templateId = process.env.HMS_TEMPLATE_ID;
  if (!accessKey || !appSecret || !templateId) {
    throw new Error(
      "100ms not configured — set HMS_APP_ACCESS_KEY, HMS_APP_SECRET, HMS_TEMPLATE_ID.",
    );
  }
  return { accessKey, appSecret, templateId };
}

/**
 * Mint a short-lived management token for server→100ms REST. 24-hour
 * expiry is fine — the token never leaves our server.
 */
function getManagementToken(): string {
  const { accessKey, appSecret } = getCreds();
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      access_key: accessKey,
      type: "management",
      version: 2,
      iat: now,
      nbf: now,
    },
    appSecret,
    { algorithm: "HS256", expiresIn: "24h", jwtid: cryptoRandom() },
  );
}

function cryptoRandom(): string {
  // 16 random hex chars — short enough for jti, long enough for uniqueness.
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

export type CreateRoomInput = {
  name: string;
  description?: string;
  /** Optional template override; defaults to HMS_TEMPLATE_ID. */
  templateId?: string;
  /** Optional region pin (e.g. "in" for India). */
  region?: string;
};

export type HmsRoom = {
  id: string;
  name: string;
  customer_id: string;
  template_id: string;
};

/**
 * Create a 100ms room for a scheduled session. Returns the room id which
 * we persist on `live_sessions.providerRoomId` so the join-token mutation
 * and recording webhook can map back to it.
 */
export async function createHmsRoom(input: CreateRoomInput): Promise<HmsRoom> {
  const { templateId } = getCreds();
  const token = getManagementToken();
  const body = {
    name: input.name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .slice(0, 100),
    description: input.description?.slice(0, 200),
    template_id: input.templateId ?? templateId,
    region: input.region ?? "in",
  };
  const res = await fetch(`${HMS_API_BASE}/rooms`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`100ms POST /rooms ${res.status}: ${err}`);
  }
  const json = (await res.json()) as Partial<HmsRoom> & { id?: string };
  if (!json.id || !json.name) {
    throw new Error("100ms /rooms returned malformed response");
  }
  return {
    id: json.id,
    name: json.name,
    customer_id: json.customer_id ?? "",
    template_id: json.template_id ?? body.template_id,
  };
}

/** Soft-delete / disable a room (for cancellations). 100ms doesn't have a
 *  hard delete via REST; a disabled room can still be re-enabled later. */
export async function disableHmsRoom(roomId: string): Promise<void> {
  const token = getManagementToken();
  const res = await fetch(`${HMS_API_BASE}/rooms/${roomId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enabled: false }),
  });
  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    // Non-fatal — log and move on; cancelling our session shouldn't fail
    // because of a room-state mismatch on 100ms's side.
    console.warn(`[hms] disableRoom ${res.status}: ${err}`);
  }
}
