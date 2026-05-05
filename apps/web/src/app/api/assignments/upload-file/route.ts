/**
 * POST /api/assignments/upload-file — uploads a single file for either:
 *   - a teacher attaching a reference file to a new/edited assignment, or
 *   - a student attaching a file to their submission.
 *
 * Returns metadata the caller then passes into the assignment.create /
 * assignment.update / assignment.submit tRPC mutations. Keeping this
 * separate from the tRPC layer lets us stream large multipart payloads
 * without squeezing them through JSON/fetch.
 *
 * Body: multipart/form-data
 *   scope    — "assignment" or "submission" (folder prefix)
 *   scopeId  — classroomId (for attachments) or assignmentId (for submissions)
 *   file     — the uploaded file
 *
 * Returns: { success, data: { url, fileName, mimeType, size } }
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createDatabase } from "@examforge/shared/db";
import { fileUploads } from "@examforge/shared/db/schema";
import { saveUploadedFile } from "@/lib/content-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE_BYTES = 100 * 1024 * 1024;
const VALID_SCOPES = new Set(["assignment", "submission"]);

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

    const fd = await req.formData();
    const scope = String(fd.get("scope") ?? "");
    const scopeId = String(fd.get("scopeId") ?? "").trim();
    const file = fd.get("file");

    if (!VALID_SCOPES.has(scope)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION", message: "Invalid scope" } },
        { status: 400 },
      );
    }
    if (!scopeId) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION", message: "scopeId is required" } },
        { status: 400 },
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION", message: "file is required" } },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: { code: "FILE_TOO_LARGE", message: "File exceeds 100 MB" } },
        { status: 400 },
      );
    }

    // Folder prefix keeps assignment & submission files scoped to the
    // classroom/assignment they belong to, mirroring the creator-content
    // on-disk layout. `saveUploadedFile` treats the first arg as a
    // folder id — we prepend the scope to avoid collisions with content ids.
    const folderId = `${scope}s-${scopeId}`;
    const saved = await saveUploadedFile(folderId, file);

    await db.insert(fileUploads).values({
      userId,
      storageKey: saved.publicUrl,
      originalName: saved.fileName,
      mimeType: saved.mimeType,
      sizeBytes: saved.size,
      publicUrl: saved.publicUrl,
      processingStatus: "uploaded",
    });

    return NextResponse.json({
      success: true,
      data: {
        url: saved.publicUrl,
        fileName: saved.fileName,
        mimeType: saved.mimeType,
        size: saved.size,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("[assignments upload-file]", err);
    return NextResponse.json(
      { success: false, error: { code: "UPLOAD_FAILED", message } },
      { status: 500 },
    );
  }
}
