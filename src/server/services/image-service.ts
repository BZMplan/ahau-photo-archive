import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { requireAdmin } from "../auth/admin";
import {
  generateImageVariants,
  generatePreviewImage,
  validateImage,
} from "../images/processor";
import {
  assertOriginalKey,
  assertPhotoId,
  assertStorageKey,
  originalKey,
  previewKey,
  publicKeys,
  publicationKeys,
  type ImageFormat,
} from "../storage/keys";
import { StorageError, storageErrorCode } from "../storage/errors";
import { getStorage } from "../storage";
import {
  getOperationJournal,
  type ImageOperation,
  type OperationJournal,
  type OperationObject,
} from "../storage/journal";
import type { StoragePair } from "../storage/types";

export interface PublicationReceipt {
  operationId: string;
  displayKey: string;
  thumbnailKey: string;
}
export interface VersionedPublicationReceipt extends PublicationReceipt {
  publicationId: string;
}
export class ImageOperationError extends Error {
  constructor(
    readonly operationId: string,
    readonly code: string,
  ) {
    super("图片文件操作未完成，请通过操作记录重试或恢复。");
    this.name = "ImageOperationError";
  }
}
// Single-instance serialization avoids two publishers/deleters racing on fixed keys.
const locks = new Map<string, Promise<unknown>>();
async function locked<T>(
  photoId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(photoId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  locks.set(photoId, current);
  try {
    return await current;
  } finally {
    if (locks.get(photoId) === current) locks.delete(photoId);
  }
}
export class ImageService {
  constructor(
    private readonly storage: StoragePair,
    private readonly journal: OperationJournal,
  ) {
    if (
      storage.private.scope !== "private" ||
      storage.public.scope !== "public"
    )
      throw new Error("Image storage scopes must be isolated.");
  }
  async saveOriginal(data: Buffer, photoId = randomUUID()) {
    assertPhotoId(photoId);
    const metadata = await validateImage(data);
    const key = originalKey(photoId, metadata.format);
    await locked(photoId, async () => {
      for (const format of ["jpeg", "png", "webp"] as ImageFormat[]) {
        const candidate = originalKey(photoId, format);
        if (candidate !== key && (await this.storage.private.exists(candidate)))
          throw new StorageError("CONFLICT");
      }
      if (await this.storage.private.exists(key)) {
        const existing = await this.storage.private.get(key);
        if (!existing.equals(data)) throw new StorageError("CONFLICT");
        return;
      }
      await this.storage.private.put(key, data, {
        contentType: metadata.mimeType,
        ifAbsent: true,
      });
    });
    return { photoId, key, metadata };
  }
  async getPrivateImage(photoId: string, key: string): Promise<Buffer> {
    assertStorageKey("private", key);
    if (key !== previewKey(photoId)) assertOriginalKey(photoId, key);
    return this.storage.private.get(key);
  }
  /** Internal submission compensation; callers must already have validated ownership of these keys. */
  async cleanupPrivateFiles(
    photoId: string,
    sourceKey: string,
    privatePreviewKey: string,
  ): Promise<void> {
    assertOriginalKey(photoId, sourceKey);
    if (privatePreviewKey !== previewKey(photoId))
      throw new StorageError("INVALID_KEY");
    await locked(photoId, async () => {
      const results = await Promise.allSettled([
        this.storage.private.delete(sourceKey),
        this.storage.private.delete(privatePreviewKey),
      ]);
      if (results.some((result) => result.status === "rejected"))
        throw new StorageError("IO_ERROR");
    });
  }
  /** Remove every canonical private object for a known photo id after an uncertain write. */
  async cleanupPrivatePhoto(photoId: string): Promise<void> {
    assertPhotoId(photoId);
    await locked(photoId, async () => {
      const objects = [
        previewKey(photoId),
        ...(["jpeg", "png", "webp"] as ImageFormat[]).map((format) =>
          originalKey(photoId, format),
        ),
      ];
      const results = await Promise.allSettled(
        objects.map((key) => this.storage.private.delete(key)),
      );
      if (results.some((result) => result.status === "rejected"))
        throw new StorageError("IO_ERROR");
    });
  }
  async generatePreview(photoId: string, sourceKey: string) {
    assertOriginalKey(photoId, sourceKey);
    return locked(photoId, async () => {
      const result = await generatePreviewImage(
        await this.storage.private.get(sourceKey),
      );
      const key = previewKey(photoId);
      await this.storage.private.put(key, result.buffer, {
        contentType: "image/webp",
      });
      return { key, ...result };
    });
  }
  async generateVariants(photoId: string, sourceKey: string) {
    assertOriginalKey(photoId, sourceKey);
    return generateImageVariants(await this.storage.private.get(sourceKey));
  }
  /** Publish a new immutable public version. The publication id is server generated. */
  async publishImageVersion(
    photoId: string,
    sourceKey: string,
    requestHeaders: Headers,
  ): Promise<VersionedPublicationReceipt> {
    await requireAdmin(requestHeaders);
    assertOriginalKey(photoId, sourceKey);
    return locked(photoId, async () => {
      const variants = await this.generateVariants(photoId, sourceKey);
      await requireAdmin(requestHeaders);
      const publicationId = randomUUID();
      const keys = publicationKeys(photoId, publicationId);
      const objects: OperationObject[] = [
        { scope: "public", key: keys.displayKey },
        { scope: "public", key: keys.thumbnailKey },
      ];
      const operation = this.journal.begin(photoId, "publish", objects);
      try {
        await this.storage.public.put(
          keys.displayKey,
          variants.display.buffer,
          {
            contentType: "image/webp",
            ifAbsent: true,
          },
        );
        await this.storage.public.put(
          keys.thumbnailKey,
          variants.thumbnail.buffer,
          { contentType: "image/webp", ifAbsent: true },
        );
        this.journal.update(operation.id, "awaiting_commit");
        return { operationId: operation.id, publicationId, ...keys };
      } catch (error) {
        await this.cleanup(operation, storageErrorCode(error));
        throw new ImageOperationError(operation.id, storageErrorCode(error));
      }
    });
  }
  async publishImage(
    photoId: string,
    sourceKey: string,
    requestHeaders: Headers,
  ): Promise<PublicationReceipt> {
    await requireAdmin(requestHeaders);
    assertOriginalKey(photoId, sourceKey);
    return locked(photoId, async () => {
      const variants = await this.generateVariants(photoId, sourceKey);
      // Check again after CPU work; expiry/revocation must not grant a delayed publication.
      await requireAdmin(requestHeaders);
      const keys = publicKeys(photoId);
      const pending: { key: string; buffer: Buffer }[] = [];
      for (const [key, buffer] of [
        [keys.displayKey, variants.display.buffer],
        [keys.thumbnailKey, variants.thumbnail.buffer],
      ] as const) {
        if (await this.storage.public.exists(key)) {
          const info = await this.storage.public.head(key);
          if (info.sha256 !== createHash("sha256").update(buffer).digest("hex"))
            throw new StorageError("CONFLICT");
        } else pending.push({ key, buffer });
      }
      // Persist every potentially written key BEFORE uploads, including uncertain network results.
      const operation = this.journal.begin(
        photoId,
        "publish",
        pending.map((item) => ({ scope: "public", key: item.key })),
      );
      try {
        for (const item of pending)
          await this.storage.public.put(item.key, item.buffer, {
            contentType: "image/webp",
            ifAbsent: true,
          });
        this.journal.update(operation.id, "awaiting_commit");
        return { operationId: operation.id, ...keys };
      } catch (error) {
        await this.cleanup(operation, storageErrorCode(error));
        throw new ImageOperationError(operation.id, storageErrorCode(error));
      }
    });
  }
  // Call only AFTER the future business transaction commits approved + keys + moderation log.
  async confirmPublication(
    receipt: PublicationReceipt,
    requestHeaders: Headers,
  ): Promise<void> {
    await requireAdmin(requestHeaders);
    const operation = this.findOperation(receipt.operationId);
    await locked(operation.photoId, async () => {
      await requireAdmin(requestHeaders);
      await this.completePublication(
        receipt,
        this.findOperation(receipt.operationId),
      );
    });
  }
  async confirmVersionPublication(
    receipt: VersionedPublicationReceipt,
    requestHeaders: Headers,
  ): Promise<void> {
    await requireAdmin(requestHeaders);
    const operation = this.findOperation(receipt.operationId);
    await locked(operation.photoId, async () => {
      await requireAdmin(requestHeaders);
      const current = this.findOperation(receipt.operationId);
      if (current.action !== "publish" || current.state !== "awaiting_commit")
        throw new StorageError("CONFLICT");
      if (
        current.objects.length !== 2 ||
        !current.objects.every((item) => item.scope === "public") ||
        !current.objects.some((item) => item.key === receipt.displayKey) ||
        !current.objects.some((item) => item.key === receipt.thumbnailKey)
      )
        throw new StorageError("INVALID_KEY");
      if (
        !(await this.storage.public.exists(receipt.displayKey)) ||
        !(await this.storage.public.exists(receipt.thumbnailKey))
      )
        throw new StorageError("NOT_FOUND");
      this.journal.update(current.id, "complete");
    });
  }
  private async completePublication(
    receipt: PublicationReceipt,
    operation: ImageOperation,
    allowWriting = false,
  ) {
    if (operation.action !== "publish") throw new StorageError("CONFLICT");
    const keys = publicKeys(operation.photoId);
    if (
      receipt.displayKey !== keys.displayKey ||
      receipt.thumbnailKey !== keys.thumbnailKey
    )
      throw new StorageError("INVALID_KEY");
    if (
      operation.state !== "awaiting_commit" &&
      operation.state !== "complete" &&
      !(allowWriting && operation.state === "writing")
    )
      throw new StorageError("CONFLICT");
    if (
      !(await this.storage.public.exists(keys.displayKey)) ||
      !(await this.storage.public.exists(keys.thumbnailKey))
    )
      throw new StorageError("NOT_FOUND");
    this.journal.update(operation.id, "complete");
  }
  async unpublishImage(
    photoId: string,
    requestHeaders: Headers,
  ): Promise<void> {
    await requireAdmin(requestHeaders);
    const keys = publicKeys(photoId);
    await this.remove(
      photoId,
      "unpublish",
      Object.values(keys).map((key) => ({ scope: "public", key })),
      requestHeaders,
    );
  }
  async unpublishPublication(
    photoId: string,
    keys: { displayKey: string; thumbnailKey: string },
    requestHeaders: Headers,
  ): Promise<void> {
    await requireAdmin(requestHeaders);
    for (const key of Object.values(keys)) {
      assertStorageKey("public", key);
      if (key.split("/")[1] !== photoId) throw new StorageError("INVALID_KEY");
    }
    await this.remove(
      photoId,
      "unpublish",
      Object.values(keys).map((key) => ({ scope: "public" as const, key })),
      requestHeaders,
    );
  }
  async deleteImageFiles(
    photoId: string,
    requestHeaders: Headers,
  ): Promise<void> {
    await requireAdmin(requestHeaders);
    const objects: OperationObject[] = [
      ...Object.values(publicKeys(photoId)).map((key) => ({
        scope: "public" as const,
        key,
      })),
      { scope: "private", key: previewKey(photoId) },
      ...(["jpeg", "png", "webp"] as ImageFormat[]).map((format) => ({
        scope: "private" as const,
        key: originalKey(photoId, format),
      })),
    ];
    await this.remove(photoId, "delete", objects, requestHeaders);
  }
  private async remove(
    photoId: string,
    action: "unpublish" | "delete",
    objects: OperationObject[],
    requestHeaders: Headers,
  ) {
    await locked(photoId, async () => {
      await requireAdmin(requestHeaders);
      const operation = this.journal.begin(photoId, action, objects);
      if (!(await this.cleanup(operation)))
        throw new ImageOperationError(operation.id, "CLEANUP_FAILED");
    });
  }
  private findOperation(id: string): ImageOperation {
    assertPhotoId(id);
    const operation = this.journal.find(id);
    if (!operation) throw new StorageError("NOT_FOUND");
    for (const object of operation.objects) {
      if (!["private", "public"].includes(object.scope))
        throw new StorageError("INVALID_KEY");
      assertStorageKey(object.scope, object.key);
      if (object.key.split("/")[1] !== operation.photoId)
        throw new StorageError("INVALID_KEY");
    }
    return operation;
  }
  private async cleanup(
    operation: ImageOperation,
    reason?: string,
  ): Promise<boolean> {
    const results = await Promise.allSettled(
      operation.objects.map((object) =>
        this.storage[object.scope].delete(object.key),
      ),
    );
    const failed = results.some((result) => result.status === "rejected");
    try {
      this.journal.update(
        operation.id,
        failed ? "cleanup_failed" : "complete",
        failed ? "CLEANUP_FAILED" : reason,
      );
    } catch {
      console.error(
        JSON.stringify({
          event: "image_journal_update_failed",
          operationId: operation.id,
          photoId: operation.photoId,
        }),
      );
      throw new ImageOperationError(operation.id, "JOURNAL_FAILED");
    }
    if (failed)
      console.error(
        JSON.stringify({
          event: "image_cleanup_failed",
          operationId: operation.id,
          photoId: operation.photoId,
          code: "CLEANUP_FAILED",
        }),
      );
    return !failed;
  }
  // Recovery is explicit: awaiting_commit may already have committed in SQLite; never auto-delete it.
  async recoverOperation(
    id: string,
    decision: "keep" | "remove",
    requestHeaders: Headers,
  ): Promise<void> {
    await requireAdmin(requestHeaders);
    const initial = this.findOperation(id);
    await locked(initial.photoId, async () => {
      await requireAdmin(requestHeaders);
      const operation = this.findOperation(id);
      if (operation.state === "complete") return;
      if (decision === "keep") {
        if (
          operation.action !== "publish" ||
          operation.state === "cleanup_failed"
        )
          throw new StorageError("CONFLICT");
        const keys = publicKeys(operation.photoId);
        await this.completePublication(
          { operationId: operation.id, ...keys },
          operation,
          true,
        );
      } else if (!(await this.cleanup(operation)))
        throw new ImageOperationError(operation.id, "CLEANUP_FAILED");
    });
  }
}
export function getImageService(): ImageService {
  return new ImageService(getStorage(), getOperationJournal());
}
