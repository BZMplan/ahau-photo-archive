import "server-only";
import { createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { assertStorageKey, keyContentType } from "./keys";
import { StorageError } from "./errors";
import {
  MAX_OBJECT_BYTES,
  PRIVATE_CACHE_CONTROL,
  PUBLIC_CACHE_CONTROL,
  type ObjectStorage,
  type StorageOptions,
  type StorageScope,
} from "./types";
import type { StorageEnvironment } from "./environment";
function mapError(error: unknown): never {
  if (error instanceof StorageError) throw error;
  const record =
    error && typeof error === "object"
      ? (error as { name?: string; $metadata?: { httpStatusCode?: number } })
      : {};
  const status = record.$metadata?.httpStatusCode;
  throw new StorageError(
    status === 404 || ["NoSuchKey", "NotFound"].includes(record.name ?? "")
      ? "NOT_FOUND"
      : status === 403 ||
          [
            "AccessDenied",
            "InvalidAccessKeyId",
            "SignatureDoesNotMatch",
          ].includes(record.name ?? "")
        ? "FORBIDDEN"
        : status === 412
          ? "CONFLICT"
          : !status || status >= 500 || status === 429
            ? "UNAVAILABLE"
            : "IO_ERROR",
  );
}
export function createR2Client(
  environment: Extract<StorageEnvironment, { driver: "r2" }>,
) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${environment.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: environment.accessKeyId,
      secretAccessKey: environment.secretAccessKey,
    },
    maxAttempts: 3,
  });
}
export class R2Storage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    readonly scope: StorageScope,
  ) {}
  async put(key: string, data: Buffer, options: StorageOptions): Promise<void> {
    assertStorageKey(this.scope, key);
    if (data.length === 0 || data.length > MAX_OBJECT_BYTES)
      throw new StorageError("TOO_LARGE");
    if (options.contentType !== keyContentType(key))
      throw new StorageError("INVALID_KEY");
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: data,
          ContentType: options.contentType,
          CacheControl:
            this.scope === "private"
              ? PRIVATE_CACHE_CONTROL
              : PUBLIC_CACHE_CONTROL,
          IfNoneMatch: options.ifAbsent ? "*" : undefined,
          Metadata: { sha256: createHash("sha256").update(data).digest("hex") },
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
    } catch (error) {
      mapError(error);
    }
  }
  async get(key: string): Promise<Buffer> {
    assertStorageKey(this.scope, key);
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      if (!response.Body) throw new StorageError("NOT_FOUND");
      const reader = response.Body.transformToWebStream().getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        if ((response.ContentLength ?? 0) > MAX_OBJECT_BYTES)
          throw new StorageError("TOO_LARGE");
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > MAX_OBJECT_BYTES) throw new StorageError("TOO_LARGE");
          chunks.push(value);
        }
      } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
      } finally {
        reader.releaseLock();
      }
      return Buffer.concat(chunks, length);
    } catch (error) {
      return mapError(error);
    }
  }
  async head(key: string) {
    assertStorageKey(this.scope, key);
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      return {
        size: response.ContentLength ?? 0,
        contentType: keyContentType(key),
        sha256: response.Metadata?.sha256,
      };
    } catch (error) {
      return mapError(error);
    }
  }
  async exists(key: string): Promise<boolean> {
    try {
      await this.head(key);
      return true;
    } catch (error) {
      if (error instanceof StorageError && error.code === "NOT_FOUND")
        return false;
      throw error;
    }
  }
  async delete(key: string): Promise<void> {
    assertStorageKey(this.scope, key);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
    } catch (error) {
      try {
        mapError(error);
      } catch (mapped) {
        if (mapped instanceof StorageError && mapped.code === "NOT_FOUND")
          return;
        throw mapped;
      }
    }
  }
}
