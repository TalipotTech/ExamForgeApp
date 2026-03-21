import { promises as fs } from "node:fs";
import { join, resolve, dirname } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

export interface StorageProvider {
  upload(key: string, content: string): Promise<void>;
  download(key: string): Promise<string>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const STORAGE_ROOT = resolve(join(process.cwd(), "storage", "tutorials"));

export class LocalStorageProvider implements StorageProvider {
  async upload(key: string, content: string): Promise<void> {
    const filePath = this.resolvePath(key);
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }

  async download(key: string): Promise<string> {
    const filePath = this.resolvePath(key);
    return fs.readFile(filePath, "utf-8");
  }

  getUrl(key: string): string {
    return `/api/files/tutorials/${key}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist, that's ok
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.resolvePath(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private resolvePath(key: string): string {
    const safePath = key.replace(/\.\./g, "");
    const filePath = resolve(join(STORAGE_ROOT, safePath));
    if (!filePath.startsWith(STORAGE_ROOT)) {
      throw new Error("Invalid storage key: path traversal detected");
    }
    return filePath;
  }
}

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private prefix = "tutorials";

  constructor(bucket: string, region = "ap-south-1") {
    this.bucket = bucket;
    this.client = new S3Client({ region });
  }

  async upload(key: string, content: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `${this.prefix}/${key}`,
        Body: content,
        ContentType: key.endsWith(".html")
          ? "text/html; charset=utf-8"
          : "application/octet-stream",
      }),
    );
  }

  async download(key: string): Promise<string> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: `${this.prefix}/${key}`,
      }),
    );
    return (await response.Body?.transformToString("utf-8")) ?? "";
  }

  getUrl(key: string): string {
    return `/uploads/${this.prefix}/${key}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: `${this.prefix}/${key}`,
        }),
      );
    } catch {
      // Object may not exist, that's ok
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: `${this.prefix}/${key}`,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}

let storageInstance: StorageProvider | null = null;

export function getTutorialStorage(): StorageProvider {
  if (!storageInstance) {
    const s3Bucket = process.env.S3_BUCKET;
    if (s3Bucket) {
      storageInstance = new S3StorageProvider(s3Bucket, process.env.AWS_REGION || "ap-south-1");
    } else {
      storageInstance = new LocalStorageProvider();
    }
  }
  return storageInstance;
}
