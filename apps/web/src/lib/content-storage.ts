/**
 * Pluggable storage for creator content. Two backends are supported:
 *
 *   - "local" (default) — writes to apps/web/storage/creator-content/{id}/
 *                          served via GET /api/uploads/[...path]
 *   - "s3"              — uploads to S3 using AWS SDK v3. Configure via env:
 *                          CONTENT_STORAGE_BACKEND=s3
 *                          CONTENT_S3_BUCKET=…
 *                          CONTENT_S3_REGION=…
 *                          CONTENT_S3_PREFIX=creator-content  (optional)
 *                          CONTENT_S3_CDN_URL=https://cdn…    (optional)
 *                          Standard AWS creds resolution applies
 *                          (AWS_ACCESS_KEY_ID / IAM role).
 *
 * Callers only see the `SavedFile` shape; swapping backends is a single
 * env flip. The S3 backend lazy-loads @aws-sdk/client-s3 so local dev
 * doesn't pay the bundle cost.
 */

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type MediaKind = "video" | "audio" | "image" | "document";

export type SavedFile = {
  fileId: string;
  /** Absolute filesystem path for the local backend; `s3://bucket/key`
   *  placeholder for the s3 backend (not meaningful for disk I/O). */
  diskPath: string;
  /** Public URL the browser fetches the file from. */
  publicUrl: string;
  fileName: string;
  size: number;
  mimeType: string;
  kind: MediaKind;
};

export interface StorageBackend {
  readonly name: "local" | "s3";
  save(contentId: string, file: File): Promise<SavedFile>;
  /** Resolve a public URL subpath back to an on-disk path (local only).
   *  The s3 backend returns null — the file-serving route should
   *  redirect / proxy to the public URL instead. */
  resolveDisk(subPath: string): string | null;
}

// ───────────────────────── shared helpers ─────────────────────────

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
  const mimeExt = mime.split("/")[1]?.toLowerCase() ?? "bin";
  if (/^[a-z0-9]{1,8}$/.test(mimeExt)) return mimeExt;
  return "bin";
}

// ───────────────────────── local backend ─────────────────────────

const LOCAL_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "creator-content");

export async function ensureContentDir(contentId: string): Promise<string> {
  const dir = path.join(LOCAL_STORAGE_ROOT, contentId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

const localBackend: StorageBackend = {
  name: "local",
  async save(contentId, file) {
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
  },
  resolveDisk(subPath) {
    const clean = subPath.replace(/\.\./g, "");
    const target = path.resolve(
      path.dirname(LOCAL_STORAGE_ROOT),
      clean.startsWith("creator-content/") ? clean : `creator-content/${clean}`,
    );
    if (!target.startsWith(LOCAL_STORAGE_ROOT)) return null;
    return target;
  },
};

// ───────────────────────── s3 backend (lazy) ─────────────────────────

type S3ClientLike = { send: (cmd: unknown) => Promise<unknown> };
type PutObjectCommandCtor = new (input: {
  Bucket: string;
  Key: string;
  Body: Buffer;
  ContentType: string;
}) => unknown;

let s3ClientCache: { client: S3ClientLike; PutObjectCommand: PutObjectCommandCtor } | null = null;

async function getS3Client(): Promise<{
  client: S3ClientLike;
  PutObjectCommand: PutObjectCommandCtor;
}> {
  if (s3ClientCache) return s3ClientCache;
  const region = process.env.CONTENT_S3_REGION;
  if (!region) {
    throw new Error("CONTENT_S3_REGION is required for the s3 storage backend");
  }
  // @ts-expect-error dynamic import; package installed only when s3 backend is used
  const mod = (await import("@aws-sdk/client-s3").catch(() => null)) as {
    S3Client: new (opts: { region: string }) => S3ClientLike;
    PutObjectCommand: PutObjectCommandCtor;
  } | null;
  if (!mod) {
    throw new Error(
      "@aws-sdk/client-s3 is not installed. Run `pnpm add @aws-sdk/client-s3 --filter @examforge/web` to enable the s3 backend.",
    );
  }
  const client = new mod.S3Client({ region });
  s3ClientCache = { client, PutObjectCommand: mod.PutObjectCommand };
  return s3ClientCache;
}

const s3Backend: StorageBackend = {
  name: "s3",
  async save(contentId, file) {
    const bucket = process.env.CONTENT_S3_BUCKET;
    if (!bucket) throw new Error("CONTENT_S3_BUCKET is required for s3 backend");
    const prefix = (process.env.CONTENT_S3_PREFIX ?? "creator-content").replace(/\/$/, "");
    const cdnUrl = process.env.CONTENT_S3_CDN_URL;
    const region = process.env.CONTENT_S3_REGION!;

    const fileId = randomUUID();
    const ext = safeExtension(file.name, file.type);
    const key = `${prefix}/${contentId}/${fileId}.${ext}`;
    const mimeType = file.type || "application/octet-stream";

    const { client, PutObjectCommand } = await getS3Client();
    const buffer = Buffer.from(await file.arrayBuffer());
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    const publicUrl = cdnUrl
      ? `${cdnUrl.replace(/\/$/, "")}/${key}`
      : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    return {
      fileId,
      diskPath: `s3://${bucket}/${key}`,
      publicUrl,
      fileName: file.name,
      size: file.size,
      mimeType,
      kind: detectMediaKind(file.type, file.name),
    };
  },
  resolveDisk() {
    return null;
  },
};

// ───────────────────────── factory ─────────────────────────

function pickBackend(): StorageBackend {
  const choice = (process.env.CONTENT_STORAGE_BACKEND ?? "local").toLowerCase();
  if (choice === "s3") return s3Backend;
  return localBackend;
}

let cachedBackend: StorageBackend | null = null;
function backend(): StorageBackend {
  if (!cachedBackend) cachedBackend = pickBackend();
  return cachedBackend;
}

// ───────────────────────── public API ─────────────────────────

export async function saveUploadedFile(contentId: string, file: File): Promise<SavedFile> {
  return backend().save(contentId, file);
}

export function resolveStoragePath(subPath: string): string | null {
  return backend().resolveDisk(subPath);
}

export function activeStorageBackend(): "local" | "s3" {
  return backend().name;
}
