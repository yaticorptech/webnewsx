import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { env } from "../env.js";

/** Object keys we create: `avatars/<userId>/<uuid>.webp`, `covers/<userId>/<uuid>.webp`, `videos/<userId>/<uuid>.mp4`. */
export const KEY_PATTERN =
  /^(?:(?:avatars|covers)\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\.(?:webp|png|jpe?g|gif|avif)|videos\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\.mp4)$/;

export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
};

export function contentTypeForKey(key: string): string {
  return CONTENT_TYPES[extname(key).toLowerCase()] ?? "application/octet-stream";
}

/** A stored object as listed by {@link StorageDriver.list}. */
export type StoredObject = { key: string; lastModified: Date };

/** Top-level folders we write to (`avatars/<userId>/…`, `covers/<userId>/…`, `videos/<userId>/…`). */
export const UPLOAD_FOLDERS = ["avatars", "covers", "videos"] as const;

export interface StorageDriver {
  readonly kind: "local" | "r2";
  /** Stores bytes and returns the public URL. */
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
  /** Every object under `prefix` ("avatars/" or "avatars/<userId>/"). */
  list(prefix: string): AsyncIterable<StoredObject>;
  /** Deletes every object under `prefix` (a user's folder). */
  deletePrefix(prefix: string): Promise<void>;
  /** Public URL for a key (root-relative `/media/<key>` for the local driver). */
  urlFor(key: string): string;
  /** Inverse of urlFor: the key if `url` points into this storage, else null. */
  keyFromUrl(url: string): string | null;
}

/** Local disk driver (dev): files under LOCAL_UPLOAD_DIR, served by GET /media/*. */
export class LocalStorage implements StorageDriver {
  readonly kind = "local" as const;
  constructor(readonly rootDir: string) {}

  /** Absolute file path for a key, or null if the key would escape the upload dir. */
  resolvePath(key: string): string | null {
    if (!key || key.includes("\0") || key.includes("\\") || key.split("/").some((part) => part === ".." || part === ".")) return null;
    const root = resolve(this.rootDir);
    const full = resolve(root, key);
    return full.startsWith(root + sep) ? full : null;
  }

  async put(key: string, body: Buffer): Promise<string> {
    const path = this.resolvePath(key);
    if (!path) throw new Error(`Invalid storage key: ${key}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return this.urlFor(key);
  }

  async read(key: string): Promise<Buffer | null> {
    const path = this.resolvePath(key);
    if (!path) return null;
    try {
      return await readFile(path);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.resolvePath(key);
    if (path) await rm(path, { force: true });
  }

  async *list(prefix: string): AsyncIterable<StoredObject> {
    const dir = this.resolvePath(prefix.replace(/\/+$/, ""));
    if (!dir) return;
    let entries;
    try {
      entries = await readdir(dir, { recursive: true, withFileTypes: true });
    } catch {
      return; // nothing uploaded yet
    }
    const root = resolve(this.rootDir);
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = join(entry.parentPath, entry.name);
      const key = full.slice(root.length + 1).split(sep).join("/");
      if (!KEY_PATTERN.test(key)) continue;
      try {
        yield { key, lastModified: (await stat(full)).mtime };
      } catch {
        // removed meanwhile
      }
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    const dir = this.resolvePath(prefix.replace(/\/+$/, ""));
    if (dir) await rm(dir, { recursive: true, force: true });
  }

  urlFor(key: string): string {
    return `/media/${key}`;
  }

  keyFromUrl(url: string): string | null {
    if (!url.startsWith("/media/")) return null;
    const key = url.slice("/media/".length);
    return KEY_PATTERN.test(key) ? key : null;
  }
}

/** Cloudflare R2 through the S3 API. */
export class R2Storage implements StorageDriver {
  readonly kind = "r2" as const;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;

  constructor(config: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicBaseUrl: string }) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    this.bucket = config.bucket;
    this.publicBase = config.publicBaseUrl.replace(/\/+$/, "");
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: IMMUTABLE_CACHE }),
    );
    return this.urlFor(key);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async *list(prefix: string): AsyncIterable<StoredObject> {
    let token: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const object of page.Contents ?? []) {
        if (object.Key && KEY_PATTERN.test(object.Key)) yield { key: object.Key, lastModified: object.LastModified ?? new Date() };
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }

  async deletePrefix(prefix: string): Promise<void> {
    let batch: string[] = [];
    const flush = async () => {
      if (batch.length === 0) return;
      await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }));
      batch = [];
    };
    for await (const object of this.list(prefix)) {
      batch.push(object.key);
      if (batch.length === 1000) await flush();
    }
    await flush();
  }

  urlFor(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  keyFromUrl(url: string): string | null {
    const prefix = `${this.publicBase}/`;
    if (!url.startsWith(prefix)) return null;
    const key = url.slice(prefix.length);
    return KEY_PATTERN.test(key) ? key : null;
  }
}

function createStorage(): StorageDriver {
  if (env.r2Enabled) {
    return new R2Storage({
      accountId: env.R2_ACCOUNT_ID as string,
      accessKeyId: env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
      bucket: env.R2_BUCKET as string,
      publicBaseUrl: env.R2_PUBLIC_BASE_URL as string,
    });
  }
  return new LocalStorage(env.LOCAL_UPLOAD_DIR);
}

export const storage: StorageDriver = createStorage();

/** Storage key for a new upload. */
export function newImageKey(kind: "avatar" | "cover", userId: string): string {
  return `${kind === "avatar" ? "avatars" : "covers"}/${userId}/${crypto.randomUUID()}.webp`;
}

/** Storage key for a new story video (always an H.264 MP4 after lib/video.ts). */
export function newVideoKey(userId: string): string {
  return `videos/${userId}/${crypto.randomUUID()}.mp4`;
}

/** Best-effort delete that never throws (used after commits). */
export async function deleteQuietly(key: string | null | undefined): Promise<void> {
  if (!key) return;
  try {
    await storage.delete(key);
  } catch (error) {
    console.warn(`[storage] could not delete ${key}:`, error instanceof Error ? error.message : error);
  }
}
