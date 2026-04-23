/**
 * POST /api/creator-content/:id/add-media — append one or more files to
 * an existing content record owned by the signed-in creator.
 */

import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { createDatabase } from "@examforge/shared/db";
import {
  adminFeatureFlags,
  creatorContent,
  creatorProfiles,
  fileUploads,
} from "@examforge/shared/db/schema";
import { saveUploadedFile, type MediaKind } from "@/lib/content-storage";
import { enqueueOcrJob, type OcrModel } from "@/lib/ocr-queue-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredMediaItem = {
  type: MediaKind;
  url: string;
  fileUploadId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  order: number;
  extractedText?: string;
  ocrStatus?: "pending" | "processing" | "completed" | "failed";
  ocrModel?: string;
  ocrError?: string;
};

function deriveTopLevelType(items: StoredMediaItem[], hasBody: boolean): string {
  if (items.length === 0) return hasBody ? "note" : "document";
  if (items.some((i) => i.type === "video")) return "video";
  if (items.some((i) => i.type === "audio")) return "audio";
  if (items.some((i) => i.type === "image")) return "image";
  return "document";
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: contentId } = await ctx.params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Sign in required" } },
        { status: 401 },
      );
    }
    const userId = session.user.id;

    const db = createDatabase(process.env.DATABASE_URL!);

    const [masterFlag] = await db
      .select({ value: adminFeatureFlags.value })
      .from(adminFeatureFlags)
      .where(eq(adminFeatureFlags.key, "creators.enabled"))
      .limit(1);
    if (!masterFlag || masterFlag.value !== true) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FEATURE_DISABLED", message: "Creators ecosystem is off" },
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
        {
          success: false,
          error: { code: "FORBIDDEN", message: "Not a registered creator" },
        },
        { status: 403 },
      );
    }

    const [content] = await db
      .select()
      .from(creatorContent)
      .where(eq(creatorContent.id, contentId))
      .limit(1);
    if (!content) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Content not found" } },
        { status: 404 },
      );
    }
    if (content.creatorId !== profile.id) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Not owner" } },
        { status: 403 },
      );
    }

    const fd = await req.formData();
    const rawFiles = fd.getAll("files").filter((f): f is File => f instanceof File);
    if (rawFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION", message: "No files provided" } },
        { status: 400 },
      );
    }

    const existingMeta = (content.metadata as Record<string, unknown> | null) ?? {};
    const existingItems: StoredMediaItem[] = Array.isArray(
      (existingMeta as { mediaItems?: StoredMediaItem[] }).mediaItems,
    )
      ? ((existingMeta as { mediaItems?: StoredMediaItem[] }).mediaItems as StoredMediaItem[])
      : [];
    const startOrder = existingItems.reduce((max, i) => Math.max(max, i.order + 1), 0);

    const addedItems: StoredMediaItem[] = [];
    const savedDiskPaths: string[] = [];
    const ocrJobSpecs: Array<{ order: number; diskPath: string; mimeType: string }> = [];

    const contentIsHandwritten = (existingMeta as { handwritten?: boolean }).handwritten === true;
    const contentOcrModel: OcrModel =
      ((existingMeta as { ocrModel?: OcrModel }).ocrModel as OcrModel) ?? "gemini-2.5-pro";

    try {
      for (let i = 0; i < rawFiles.length; i++) {
        const saved = await saveUploadedFile(contentId, rawFiles[i]!);
        savedDiskPaths.push(saved.diskPath);
        const [fileRow] = await db
          .insert(fileUploads)
          .values({
            userId,
            storageKey: saved.publicUrl,
            originalName: saved.fileName,
            mimeType: saved.mimeType,
            sizeBytes: saved.size,
            publicUrl: saved.publicUrl,
            processingStatus: "uploaded",
          })
          .returning({ id: fileUploads.id });
        if (!fileRow) throw new Error("Failed to record file upload");
        const order = startOrder + i;
        const needsOcr = contentIsHandwritten && saved.kind === "image";
        addedItems.push({
          type: saved.kind,
          url: saved.publicUrl,
          fileUploadId: fileRow.id,
          fileName: saved.fileName,
          fileSize: saved.size,
          mimeType: saved.mimeType,
          order,
          ...(needsOcr ? { ocrStatus: "pending" } : {}),
        });
        if (needsOcr) {
          ocrJobSpecs.push({ order, diskPath: saved.diskPath, mimeType: saved.mimeType });
        }
      }

      const allItems = [...existingItems, ...addedItems];
      const nextContentType = deriveTopLevelType(allItems, !!content.body);
      const nextThumb =
        content.thumbnailUrl ?? allItems.find((m) => m.type === "image")?.url ?? null;

      await db
        .update(creatorContent)
        .set({
          metadata: { ...existingMeta, mediaItems: allItems },
          contentType: nextContentType,
          thumbnailUrl: nextThumb,
          updatedAt: new Date(),
        })
        .where(eq(creatorContent.id, contentId));

      if (ocrJobSpecs.length > 0) {
        const [ocrFlag] = await db
          .select({ value: adminFeatureFlags.value })
          .from(adminFeatureFlags)
          .where(eq(adminFeatureFlags.key, "creators.ocr_enabled"))
          .limit(1);
        if (ocrFlag?.value === true) {
          await Promise.all(
            ocrJobSpecs.map((spec) =>
              enqueueOcrJob({
                contentId,
                mediaOrder: spec.order,
                diskPath: spec.diskPath,
                mimeType: spec.mimeType,
                model: contentOcrModel,
                userId,
              }).catch((e) => {
                console.error(`[add-media] failed to enqueue OCR for order ${spec.order}:`, e);
              }),
            ),
          );
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          added: addedItems.length,
          total: allItems.length,
          ocrQueued: ocrJobSpecs.length,
        },
      });
    } catch (err) {
      await Promise.all(savedDiskPaths.map((p) => fs.unlink(p).catch(() => undefined)));
      throw err;
    }
  } catch (err) {
    console.error("[creator-content add-media]", err);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "ADD_MEDIA_FAILED",
          message: err instanceof Error ? err.message : "Failed",
        },
      },
      { status: 500 },
    );
  }
}
