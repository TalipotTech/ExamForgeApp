import { promises as fs } from "node:fs";
import { join, resolve, dirname } from "node:path";

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

let storageInstance: StorageProvider | null = null;

export function getTutorialStorage(): StorageProvider {
  if (!storageInstance) {
    storageInstance = new LocalStorageProvider();
  }
  return storageInstance;
}
