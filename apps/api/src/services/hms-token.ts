/**
 * 100ms end-user auth-token signer.
 *
 * Distinct from the management token in `hms-client.ts`. This token is
 * what the browser SDK exchanges to join a specific room as a specific
 * peer with a specific role. Format per
 * https://www.100ms.live/docs/get-started/v2/get-started/server-side/auth-token
 */

import jwt from "jsonwebtoken";

export type HmsRole = "creator" | "student";

export type HmsAuthTokenInput = {
  roomId: string;
  userId: string;
  role: HmsRole;
  /** Token TTL in seconds. 24h is the sweet-spot per the design doc. */
  ttlSeconds?: number;
};

/**
 * Issues a short-lived JWT scoped to one room + one user + one role. The
 * 100ms SDK does the actual handshake using this token; if it expires
 * mid-session the SDK reconnects via a new token request.
 */
export function issueHmsAuthToken(input: HmsAuthTokenInput): string {
  const accessKey = process.env.HMS_APP_ACCESS_KEY;
  const appSecret = process.env.HMS_APP_SECRET;
  if (!accessKey || !appSecret) {
    throw new Error("HMS_APP_ACCESS_KEY / HMS_APP_SECRET not configured");
  }
  const ttl = input.ttlSeconds ?? 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      access_key: accessKey,
      type: "app",
      version: 2,
      room_id: input.roomId,
      user_id: input.userId,
      role: input.role,
      iat: now,
      nbf: now,
    },
    appSecret,
    { algorithm: "HS256", expiresIn: ttl, jwtid: `${input.userId}-${now}` },
  );
}
