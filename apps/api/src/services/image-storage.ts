// Pluggable storage for generated images. Mirrors the dual-provider
// pattern in tutorial-storage.ts so the image pipeline isn't bound to S3.
//
//   IMAGE_STORAGE_DRIVER = "local" | "s3"
//     - unset → auto: "s3" if IMAGE_S3_BUCKET is set, else "local"
//
// local  → writes to IMAGE_STORAGE_DIR (default <cwd>/storage/images),
//          served by the /api/images/* route. On Railway, point
//          IMAGE_STORAGE_DIR at a mounted Volume (e.g. /data/images) so
//          files survive redeploys.
// s3     → uses lib/s3.ts (works with AWS S3 and any S3-compatible store
//          such as Cloudflare R2 via a custom endpoint). Switch later by
//          setting IMAGE_STORAGE_DRIVER=s3 + IMAGE_S3_BUCKET — no code change.

import { promises as fs } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { uploadBufferToS3 } from "../lib/s3.js";

export interface ImageStorageProvider {
  upload(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Public URL for a stored key. May be relative (local, no public base)
   *  or absolute (local with IMAGE_PUBLIC_BASE_URL set, or s3). */
  getUrl(key: string): string;
}

// Absolute root for local image files. On Railway set this to the Volume
// mount path (e.g. /data/images); locally it defaults under the cwd.
export const IMAGE_STORAGE_DIR = resolve(
  process.env.IMAGE_STORAGE_DIR ?? join(process.cwd(), "storage", "images"),
);

class LocalImageStorage implements ImageStorageProvider {
  async upload(key: string, data: Buffer): Promise<void> {
    const filePath = this.resolvePath(key);
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  getUrl(key: string): string {
    // IMAGE_PUBLIC_BASE_URL lets us store absolute URLs (the API's public
    // origin) so consumers on a different origin (the web app) can load
    // them directly. Defaults to a relative path; the web app prefixes
    // relative URLs with NEXT_PUBLIC_API_URL at render time.
    const base = (process.env.IMAGE_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
    return `${base}/api/images/${key}`;
  }

  private resolvePath(key: string): string {
    const safeKey = key.replace(/\.\./g, "");
    const filePath = resolve(join(IMAGE_STORAGE_DIR, safeKey));
    if (!filePath.startsWith(IMAGE_STORAGE_DIR)) {
      throw new Error("Invalid image key: path traversal detected");
    }
    return filePath;
  }
}

class S3ImageStorage implements ImageStorageProvider {
  constructor(private readonly bucket: string) {}

  async upload(key: string, data: Buffer, contentType: string): Promise<void> {
    await uploadBufferToS3(this.bucket, key, data, contentType);
  }

  getUrl(key: string): string {
    return process.env.IMAGE_CLOUDFRONT_DOMAIN
      ? `https://${process.env.IMAGE_CLOUDFRONT_DOMAIN}/${key}`
      : `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }
}

let instance: ImageStorageProvider | null = null;

export function getImageStorage(): ImageStorageProvider {
  if (!instance) {
    const driver =
      process.env.IMAGE_STORAGE_DRIVER ?? (process.env.IMAGE_S3_BUCKET ? "s3" : "local");
    if (driver === "s3") {
      const bucket = process.env.IMAGE_S3_BUCKET;
      if (!bucket) {
        throw new Error("IMAGE_STORAGE_DRIVER=s3 but IMAGE_S3_BUCKET is not set");
      }
      instance = new S3ImageStorage(bucket);
    } else {
      instance = new LocalImageStorage();
    }
  }
  return instance;
}
