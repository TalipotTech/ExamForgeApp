/**
 * Local-disk storage for creator content. Files are saved under
 *   apps/web/storage/creator-content/{contentId}/{fileId}.{ext}
 * and served back through the Next.js route handler at
 *   /api/uploads/creator-content/{contentId}/{fileId}.{ext}
 *
 * This is a dev-first setup. For production you'd swap this module out
 * for presigned S3 uploads + CloudFront signed URLs; the callers only
 * see the returned `{ diskPath, publicUrl }` shape, so they shouldn't
 * need to change.
 */

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

// All creator-content files live under this root (monorepo-relative).
// apps/web/storage is git-ignored so user uploads don't pollute commits.
const STORAGE_ROOT = path.resolve(process.cwd(), "storage", "creator-content");

export type MediaKind = "video" | "audio" | "image" | "document";

export function detectMediaKind(mime: string, fileName: string): MediaKind {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf", "docx", "doc", "pptx", "ppt", "txt", "md"].includes(ext)) return "document";
  return "document";
}

export function safeExtension(fileName: string, mime: string): string {
  const nameExt = fileName.split(".").pop()?.toLowerCase();
  if (nameExt && /^[a-z0-9]{1,8}$/.test(nameExt)) return nameExt;
  // Fallback from MIME
  const mimeExt = mime.split("/")[1]?.toLowerCase() ?? "bin";
  if (/^[a-z0-9]{1,8}$/.test(mimeExt)) return mimeExt;
  return "bin";
}

export async function ensureContentDir(contentId: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, contentId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export type SavedFile = {
  fileId: string;
  diskPath: string;
  publicUrl: string;
  fileName: string;
  size: number;
  mimeType: string;
  kind: MediaKind;
};

export async function saveUploadedFile(contentId: string, file: File): Promise<SavedFile> {
  const dir = await ensureContentDir(contentId);
  const ext = safeExtension(file.name, file.type);
  const fileId = randomUUID();
  const diskFileName = `${fileId}.${ext}`;
  const diskPath = path.join(dir, diskFileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(diskPath, buffer);
  return {
    fileId,
    diskPath,
    publicUrl: `/api/uploads/creator-content/${contentId}/${diskFileName}`,
    fileName: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    kind: detectMediaKind(file.type, file.name),
  };
}

/**
 * Resolve an on-disk path for a public URL path, with traversal protection.
 * Returns null if the target escapes the storage root.
 */
export function resolveStoragePath(subPath: string): string | null {
  // subPath is the portion after /api/uploads/
  const clean = subPath.replace(/\.\./g, "");
  const target = path.resolve(
    path.dirname(STORAGE_ROOT),
    clean.startsWith("creator-content/") ? clean : `creator-content/${clean}`,
  );
  if (!target.startsWith(STORAGE_ROOT)) return null;
  return target;
}
