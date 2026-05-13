/**
 * POST /api/webhooks/zoom
 *
 * Receives Zoom marketplace webhooks. Handles:
 *   - `endpoint.url_validation` — Zoom's one-time CRC handshake. We HMAC
 *     the plainToken with ZOOM_WEBHOOK_SECRET_TOKEN and echo it back; Zoom
 *     uses this to prove we own the URL.
 *   - `recording.completed` — attaches the recording URL to the matching
 *     live_sessions row (lookup by Zoom meeting `id` we stored at
 *     scheduling time).
 *   - `meeting.started` / `meeting.ended` — flips status to live/ended.
 *
 * Signature verification: Zoom sends `x-zm-signature` of form
 * `v0=<hex>` where the hex is HMAC-SHA256 of `v0:<x-zm-request-timestamp>:<body>`
 * keyed by ZOOM_WEBHOOK_SECRET_TOKEN. We also reject timestamps older than
 * 5 minutes to defeat replay.
 */

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import { liveSessions } from "@examforge/shared/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPLAY_WINDOW_SECONDS = 5 * 60;

function bad(reason: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: reason }, { status });
}

function verifySignature(
  rawBody: string,
  header: string,
  timestamp: string,
  secret: string,
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex");
  const candidate = header.startsWith("v0=") ? header.slice(3) : header;
  // timingSafeEqual requires equal-length buffers — bail early if not.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(candidate, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

type ZoomEnvelope = {
  event: string;
  payload?: {
    plainToken?: string;
    object?: {
      id?: string | number;
      uuid?: string;
      recording_files?: Array<{
        play_url?: string;
        download_url?: string;
        recording_type?: string;
      }>;
    };
  };
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
    if (!secret) {
      console.error("[zoom-webhook] ZOOM_WEBHOOK_SECRET_TOKEN missing");
      return bad("not_configured", 503);
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-zm-signature");
    const timestamp = req.headers.get("x-zm-request-timestamp");

    let parsed: ZoomEnvelope;
    try {
      parsed = JSON.parse(rawBody) as ZoomEnvelope;
    } catch {
      return bad("invalid_json");
    }

    // Special-case: the URL validation challenge has no signature on it;
    // Zoom expects the encrypted-token echo response below.
    if (parsed.event === "endpoint.url_validation" && parsed.payload?.plainToken) {
      const plain = parsed.payload.plainToken;
      const encrypted = crypto.createHmac("sha256", secret).update(plain).digest("hex");
      return NextResponse.json({ plainToken: plain, encryptedToken: encrypted });
    }

    if (!signature || !timestamp) {
      return bad("missing_signature", 401);
    }
    const tsNum = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > REPLAY_WINDOW_SECONDS) {
      return bad("stale_timestamp", 401);
    }
    if (!verifySignature(rawBody, signature, timestamp, secret)) {
      return bad("bad_signature", 401);
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error("[zoom-webhook] DATABASE_URL missing");
      return bad("not_configured", 503);
    }

    const meetingId = parsed.payload?.object?.id;
    if (!meetingId) {
      return NextResponse.json({ ok: true, ignored: "no_meeting_id" });
    }
    const meetingIdStr = String(meetingId);

    const db = createDatabase(databaseUrl);
    const now = new Date();

    switch (parsed.event) {
      case "meeting.started": {
        await db
          .update(liveSessions)
          .set({ status: "live", startedAt: now })
          .where(eq(liveSessions.meetingId, meetingIdStr));
        return NextResponse.json({ ok: true });
      }
      case "meeting.ended": {
        await db
          .update(liveSessions)
          .set({ status: "ended", endedAt: now })
          .where(eq(liveSessions.meetingId, meetingIdStr));
        return NextResponse.json({ ok: true });
      }
      case "recording.completed": {
        const file =
          parsed.payload?.object?.recording_files?.find(
            (f) => f.recording_type === "shared_screen_with_speaker_view",
          ) ?? parsed.payload?.object?.recording_files?.[0];
        const playUrl = file?.play_url ?? file?.download_url;
        if (!playUrl) {
          return NextResponse.json({ ok: true, ignored: "no_play_url" });
        }
        await db
          .update(liveSessions)
          .set({ recordingUrl: playUrl, isRecorded: true })
          .where(eq(liveSessions.meetingId, meetingIdStr));
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ ok: true, ignored: parsed.event });
    }
  } catch (err) {
    console.error("[zoom-webhook] unexpected error", err);
    return bad("server_error", 500);
  }
}
