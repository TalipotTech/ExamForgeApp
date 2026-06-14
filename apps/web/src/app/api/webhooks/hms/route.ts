/**
 * POST /api/webhooks/hms
 *
 * 100ms-side events. We care about:
 *   - `beam.recording.success` — recording finalized → store URL
 *   - `beam.recording.failure` — log + flag the session
 *   - `room.session.started` — flip to live + set started_at
 *   - `room.session.ended`   — flip to ended + set ended_at
 *
 * Auth: 100ms posts a passcode header that we compare against
 * HMS_WEBHOOK_PASSCODE. (100ms doesn't sign payloads HMAC-style — they
 * use a shared secret in the header. Treat the passcode as you would any
 * webhook signing key.)
 */

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import { liveSessions } from "@examforge/shared/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(reason: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: reason }, { status });
}

type HmsEnvelope = {
  version?: string;
  type?: string;
  data?: {
    room_id?: string;
    session_id?: string;
    recording_path?: string;
    recording_presigned_url?: string;
    duration?: number;
    started_at?: string;
    ended_at?: string;
  };
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const passcode = process.env.HMS_WEBHOOK_PASSCODE;
    if (!passcode) {
      console.error("[hms-webhook] HMS_WEBHOOK_PASSCODE missing");
      return bad("not_configured", 503);
    }
    // 100ms sends the passcode in a custom header. Reject early on mismatch.
    const headerPasscode =
      req.headers.get("x-100ms-webhook-passcode") ?? req.headers.get("x-webhook-passcode");
    if (headerPasscode !== passcode) {
      return bad("bad_passcode", 401);
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error("[hms-webhook] DATABASE_URL missing");
      return bad("not_configured", 503);
    }

    const parsed = (await req.json()) as HmsEnvelope;
    const eventType = parsed.type;
    const roomId = parsed.data?.room_id;
    if (!eventType || !roomId) {
      return NextResponse.json({ ok: true, ignored: "no_event_or_room" });
    }

    const db = createDatabase(databaseUrl);
    const now = new Date();

    switch (eventType) {
      case "room.session.started": {
        await db
          .update(liveSessions)
          .set({ status: "live", startedAt: now })
          .where(eq(liveSessions.providerRoomId, roomId));
        return NextResponse.json({ ok: true });
      }
      case "room.session.ended": {
        await db
          .update(liveSessions)
          .set({ status: "ended", endedAt: now })
          .where(eq(liveSessions.providerRoomId, roomId));
        return NextResponse.json({ ok: true });
      }
      case "beam.recording.success": {
        const url = parsed.data?.recording_presigned_url ?? parsed.data?.recording_path;
        if (!url) {
          return NextResponse.json({ ok: true, ignored: "no_recording_url" });
        }
        const durationSeconds = parsed.data?.duration ?? 0;
        await db
          .update(liveSessions)
          .set({
            recordingUrl: url,
            isRecorded: true,
            totalWatchMinutes: Math.floor(durationSeconds / 60) || undefined,
          })
          .where(eq(liveSessions.providerRoomId, roomId));
        return NextResponse.json({ ok: true });
      }
      case "beam.recording.failure": {
        // Non-fatal — just log. Creator can still upload a recording manually.
        console.warn("[hms-webhook] recording failed", parsed.data);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ ok: true, ignored: eventType });
    }
  } catch (err) {
    console.error("[hms-webhook] unexpected error", err);
    return bad("server_error", 500);
  }
}
