import crypto from "node:crypto";

/**
 * AES-256-GCM helper for at-rest Zoom OAuth tokens. Wire format identical
 * to `apps/api/src/services/token-crypto.ts` so the web OAuth callback and
 * the API service can read each other's payloads. Key from
 * `ZOOM_TOKEN_ENCRYPTION_KEY` (base64-encoded 32 bytes).
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const KEY_LEN = 32;

function loadKey(): Buffer {
  const raw = process.env.ZOOM_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ZOOM_TOKEN_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32`.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LEN) {
    throw new Error(
      `ZOOM_TOKEN_ENCRYPTION_KEY must decode to ${KEY_LEN} bytes; got ${key.length}.`,
    );
  }
  return key;
}

export function encryptZoomToken(plaintext: string): string {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}
