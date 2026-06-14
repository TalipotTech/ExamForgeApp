/**
 * POST /api/creator-content/:id/retry-ocr
 *   body: { order: number, model?: OcrModel }
 *
 * Re-enqueues OCR for a single image media item. Used from the detail
 * page when the creator wants to re-run OCR (e.g. a different model,
 * after a failure, or to refresh the extraction).
 */

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import path from "node:path";
import { auth } from "@/lib/auth";
import { createDatabase } from "@examforge/shared/db";
import { adminFeatureFlags, creatorContent, creatorProfiles } from "@examforge/shared/db/schema";
import { enqueueOcrJob, type OcrModel } from "@/lib/ocr-queue-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredMediaItem = {
  type: "video" | "audio" | "image" | "document";
  url: string;
  fileName: string;
  mimeType: string;
  order: number;
};

const VALID_MODELS: OcrModel[] = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "claude-sonnet-4-6",
  "gpt-4o",
];

/** Map a public upload URL back to its on-disk location.
 *  `/api/uploads/creator-content/<id>/<file>` → apps/web/storage/creator-content/<id>/<file>
 */
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

    const [ocrFlag] = await db
      .select({ value: adminFeatureFlags.value })
      .from(adminFeatureFlags)
      .where(eq(adminFeatureFlags.key, "creators.ocr_enabled"))
      .limit(1);
    if (ocrFlag?.value !== true) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FEATURE_DISABLED", message: "OCR is not enabled" },
        },
        { status: 403 },
      );
    }

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
    // Accept images (existing behaviour) and documents (new — PDFs go
    // through the `file` content path in ocr-service). Audio/video are
    // not OCR targets.
    if (!target || (target.type !== "image" && target.type !== "document")) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Image or document media item not found" },
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

    const model: OcrModel = VALID_MODELS.includes(body.model as OcrModel)
      ? (body.model as OcrModel)
      : (((meta as { ocrModel?: OcrModel }).ocrModel as OcrModel) ?? "gemini-2.5-pro");

    // Mark the item as pending before enqueue so the UI reflects the retry
    const updatedItems = items.map((m) =>
      m.order === body.order
        ? {
            ...m,
            ocrStatus: "pending" as const,
            ocrError: undefined,
            ocrModel: model,
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

    await enqueueOcrJob(
      {
        contentId,
        mediaOrder: body.order,
        diskPath,
        mimeType: target.mimeType,
        model,
        userId,
      },
      { force: true },
    );

    return NextResponse.json({ success: true, data: { model } });
  } catch (err) {
    console.error("[retry-ocr]", err);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RETRY_FAILED",
          message: err instanceof Error ? err.message : "Failed",
        },
      },
      { status: 500 },
    );
  }
}
