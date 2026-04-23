/**
 * POST /api/creator-content/upload — create a new creator_content entry
 * with 0..N attached media files. Sister endpoint to the PadVik
 * /api/creators/content/upload route, adapted to ExamForge's UUID ids
 * and exam/syllabus tagging.
 *
 * Body: multipart/form-data
 *   title         — required
 *   description   — optional
 *   body          — optional markdown
 *   language      — optional (default "en")
 *   isPremium     — optional "true" / "false"
 *   examId        — optional UUID
 *   syllabusNodeId — optional integer (bigint on the DB side)
 *   subject       — optional
 *   topic         — optional
 *   files         — 0..N File entries
 *
 * Returns: { success, data: { id, title, slug } }
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
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

const VALID_OCR_MODELS: OcrModel[] = ["gemini-2.5-pro", "gemini-2.5-flash", "claude-sonnet-4-6"];

// Route handlers run on Node.js runtime by default in Next 15; body
// size can get large for multi-file uploads.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 20;
const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB per file — override via flag later.

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 500);
}

function deriveTopLevelType(kinds: MediaKind[], hasBody: boolean): string {
  if (kinds.length === 0) return hasBody ? "note" : "document";
  if (kinds.includes("video")) return "video";
  if (kinds.includes("audio")) return "audio";
  if (kinds.includes("image")) return "image";
  return "document";
}

async function assertCreatorsEnabled(db: ReturnType<typeof createDatabase>): Promise<void> {
  const [row] = await db
    .select({ value: adminFeatureFlags.value })
    .from(adminFeatureFlags)
    .where(eq(adminFeatureFlags.key, "creators.enabled"))
    .limit(1);
  if (!row || row.value !== true) {
    throw new Error("FEATURE_DISABLED: creators ecosystem is not enabled");
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Sign in required" } },
        { status: 401 },
      );
    }
    const userId = session.user.id;

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        { success: false, error: { code: "CONFIG", message: "DATABASE_URL missing" } },
        { status: 500 },
      );
    }
    const db = createDatabase(databaseUrl);

    await assertCreatorsEnabled(db);

    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);
    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "Register as a creator first" },
        },
        { status: 403 },
      );
    }

    const fd = await req.formData();

    const title = String(fd.get("title") ?? "").trim();
    if (title.length < 2) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION", message: "Title is required" } },
        { status: 400 },
      );
    }
    const description = String(fd.get("description") ?? "").trim() || null;
    const body = String(fd.get("body") ?? "").trim() || null;
    const language = String(fd.get("language") ?? "en").trim() || "en";
    const isPremium = String(fd.get("isPremium") ?? "false") === "true";
    const examIdRaw = String(fd.get("examId") ?? "").trim();
    const examId = examIdRaw || null;
    const syllabusNodeIdRaw = String(fd.get("syllabusNodeId") ?? "").trim();
    const syllabusNodeId = syllabusNodeIdRaw ? Number.parseInt(syllabusNodeIdRaw, 10) : null;
    const subject = String(fd.get("subject") ?? "").trim() || null;
    const topic = String(fd.get("topic") ?? "").trim() || null;
    const handwritten = String(fd.get("handwritten") ?? "false") === "true";
    const ocrModelRaw = String(fd.get("ocrModel") ?? "gemini-2.5-pro");
    const ocrModel: OcrModel = VALID_OCR_MODELS.includes(ocrModelRaw as OcrModel)
      ? (ocrModelRaw as OcrModel)
      : "gemini-2.5-pro";

    const rawFiles = fd.getAll("files").filter((f): f is File => f instanceof File);
    if (rawFiles.length > MAX_FILES) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "TOO_MANY_FILES", message: `Maximum ${MAX_FILES} files per upload` },
        },
        { status: 400 },
      );
    }
    for (const f of rawFiles) {
      if (f.size > MAX_SIZE_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FILE_TOO_LARGE",
              message: `"${f.name}" exceeds the per-file size limit`,
            },
          },
          { status: 400 },
        );
      }
    }
    if (rawFiles.length === 0 && !body) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION", message: "Provide at least one file or some text" },
        },
        { status: 400 },
      );
    }

    const contentId = randomUUID();

    // Save files to disk + insert file_uploads rows + build mediaItems
    const mediaItems: Array<{
      type: MediaKind;
      url: string;
      fileUploadId: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      order: number;
      ocrStatus?: "pending" | "processing" | "completed" | "failed";
    }> = [];
    const savedDiskPaths: string[] = [];
    const ocrJobSpecs: Array<{
      order: number;
      diskPath: string;
      mimeType: string;
    }> = [];

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
        if (!fileRow) throw new Error("Failed to insert file_uploads row");

        const needsOcr = handwritten && saved.kind === "image";
        mediaItems.push({
          type: saved.kind,
          url: saved.publicUrl,
          fileUploadId: fileRow.id,
          fileName: saved.fileName,
          fileSize: saved.size,
          mimeType: saved.mimeType,
          order: i,
          ...(needsOcr ? { ocrStatus: "pending" as const } : {}),
        });
        if (needsOcr) {
          ocrJobSpecs.push({
            order: i,
            diskPath: saved.diskPath,
            mimeType: saved.mimeType,
          });
        }
      }

      const kinds = mediaItems.map((m) => m.type);
      const contentType = deriveTopLevelType(kinds, !!body);
      const thumbnailUrl = mediaItems.find((m) => m.type === "image")?.url ?? null;
      const slugBase = slugify(title) || "content";
      const slug = `${slugBase}-${Date.now().toString(36)}`;

      const meta: Record<string, unknown> = { mediaItems };
      if (handwritten) {
        meta.handwritten = true;
        meta.ocrModel = ocrModel;
      }

      await db.insert(creatorContent).values({
        id: contentId,
        creatorId: profile.id,
        contentType,
        title,
        description,
        body,
        slug,
        thumbnailUrl,
        examId: examId ?? undefined,
        syllabusNodeId: syllabusNodeId ?? undefined,
        subject,
        topic,
        isPremium,
        language,
        uploadStatus: "completed",
        metadata: meta,
      });

      // Enqueue OCR for handwritten images — gated by creators.ocr_enabled.
      // Enqueuing is best-effort; the upload still succeeds even if Redis
      // is unavailable so we don't block the creator flow.
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
                model: ocrModel,
                userId,
              }).catch((e) => {
                console.error(`[upload] failed to enqueue OCR for order ${spec.order}:`, e);
              }),
            ),
          );
        }
      }

      return NextResponse.json({
        success: true,
        data: { id: contentId, title, slug, ocrQueued: ocrJobSpecs.length },
      });
    } catch (err) {
      // Best-effort cleanup: remove any files we wrote before the failure
      await Promise.all(savedDiskPaths.map((p) => fs.unlink(p).catch(() => undefined)));
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    const status = message.startsWith("FEATURE_DISABLED") ? 403 : 500;
    console.error("[creator-content upload]", err);
    return NextResponse.json(
      { success: false, error: { code: "UPLOAD_FAILED", message } },
      { status },
    );
  }
}
