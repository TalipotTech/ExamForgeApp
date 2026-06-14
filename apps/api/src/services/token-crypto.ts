import crypto from "node:crypto";

/**
 * Symmetric AES-256-GCM helpers for at-rest secrets (Zoom OAuth tokens etc.).
 *
 * Wire format: `<iv-base64>:<authTag-base64>:<ciphertext-base64>` so the row
 * stays single-string even if we rotate keys later. The IV is random per
 * encrypt — never reuse one with the same key.
 *
 * Key source: `ZOOM_TOKEN_ENCRYPTION_KEY` env var, base64-encoded 32 bytes.
 * In prod this should be sourced from AWS Secrets Manager / KMS; in dev,
 * generate with `openssl rand -base64 32` and put in `.env.local`.
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM standard
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

export function encryptToken(plaintext: string): string {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptToken(payload: string): string {
  const key = loadKey();
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted token payload");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64!, "base64");
  const tag = Buffer.from(tagB64!, "base64");
  const data = Buffer.from(dataB64!, "base64");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}
