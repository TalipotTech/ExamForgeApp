/**
 * POST /api/creator-content/:id/transcribe
 *   body: { order: number, model?: TranscriptionModel }
 *
 * Queues an audio/video media item for transcription. Mirror of the
 * retry-ocr route — same auth, same disk-path resolution, same
 * status-flip-before-enqueue pattern so the UI can poll mediaItem
 * status while the worker runs.
 */

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import path from "node:path";
import { auth } from "@/lib/auth";
import { createDatabase } from "@examforge/shared/db";
import { creatorContent, creatorProfiles } from "@examforge/shared/db/schema";
import { enqueueTranscriptionJob, type TranscriptionModel } from "@/lib/transcription-queue-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredMediaItem = {
  type: "video" | "audio" | "image" | "document";
  url: string;
  fileName: string;
  mimeType: string;
  order: number;
};

const VALID_MODELS: TranscriptionModel[] = [
  "gemini-2.0-flash",
  "sarvam-saarika",
  "sarvam-saarika-batch",
  "openai-whisper",
];

/** Map a public upload URL back to its on-disk location. Same logic the
 *  retry-ocr route uses. */
function resolveDiskPath(publicUrl: string): string | null {
  const prefix = "/api/uploads/";
  if (!publicUrl.startsWith(prefix)) return null;
  const rel = publicUrl.slice(prefix.length).replace(/\.\./g, "");
  return path.resolve(process.cwd(), "storage", rel);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: contentId } = await ctx.params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Sign in required" } },
        { status: 401 },
      );
    }
    const userId = session.user.id;

    const body = (await req.json().catch(() => null)) as { order?: number; model?: string } | null;
    if (!body || typeof body.order !== "number") {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION", message: "order required" } },
        { status: 400 },
      );
    }

    const db = createDatabase(process.env.DATABASE_URL!);

    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Not a creator" } },
        { status: 403 },
      );
    }

    const [content] = await db
      .select()
      .from(creatorContent)
      .where(eq(creatorContent.id, contentId))
      .limit(1);
    if (!content || content.creatorId !== profile.id) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Content not found" } },
        { status: 404 },
      );
    }

    const meta = (content.metadata as Record<string, unknown> | null) ?? {};
    const items: StoredMediaItem[] = Array.isArray(
      (meta as { mediaItems?: StoredMediaItem[] }).mediaItems,
    )
      ? ((meta as { mediaItems?: StoredMediaItem[] }).mediaItems as StoredMediaItem[])
      : [];
    const target = items.find((i) => i.order === body.order);
    // Transcription is audio/video only — documents go through retry-ocr,
    // images don't have spoken content.
    if (!target || (target.type !== "audio" && target.type !== "video")) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Audio or video media item not found" },
        },
        { status: 404 },
      );
    }

    const diskPath = resolveDiskPath(target.url);
    if (!diskPath) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "BAD_PATH", message: "Could not resolve file on disk" },
        },
        { status: 400 },
      );
    }

    const model: TranscriptionModel = VALID_MODELS.includes(body.model as TranscriptionModel)
      ? (body.model as TranscriptionModel)
      : "gemini-2.0-flash";

    // Flip status to pending before enqueue so the UI's poll picks up
    // "extracting…" immediately rather than after the worker grabs the
    // job (could be several seconds under load).
    const updatedItems = items.map((m) =>
      m.order === body.order
        ? {
            ...m,
            transcriptionStatus: "pending" as const,
            transcriptionError: undefined,
            transcriptionModel: model,
          }
        : m,
    );
    await db
      .update(creatorContent)
      .set({
        metadata: { ...meta, mediaItems: updatedItems },
        updatedAt: new Date(),
      })
      .where(eq(creatorContent.id, contentId));

    await enqueueTranscriptionJob(
      {
        contentId,
        mediaOrder: body.order,
        diskPath,
        mimeType: target.mimeType,
        model,
        userId,
        // creator_content.language defaults to "en" but creators can set
        // it to any 2-letter / BCP-47 code at upload. Passing it through
        // lets the provider skip its (often fuzzy) auto-detect step. The
        // service module maps it into each provider's expected format.
        language: content.language ?? undefined,
      },
      { force: true },
    );

    return NextResponse.json({ success: true, data: { model } });
  } catch (err) {
    console.error("[transcribe]", err);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "TRANSCRIBE_FAILED",
          message: err instanceof Error ? err.message : "Failed",
        },
      },
      { status: 500 },
    );
  }
}
