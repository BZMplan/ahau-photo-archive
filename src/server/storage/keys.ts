import { StorageError } from "./errors";
import type { ImageMimeType, StorageScope } from "./types";
export type ImageFormat = "jpeg" | "png" | "webp";
const uuidPattern =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
export function assertPhotoId(id: string): void {
  if (new RegExp(`^${uuidPattern}$`).exec(id)?.[0] !== id)
    throw new StorageError("INVALID_KEY");
}
export function originalKey(photoId: string, format: ImageFormat): string {
  assertPhotoId(photoId);
  return `originals/${photoId}/original.${format === "jpeg" ? "jpg" : format}`;
}
export function previewKey(photoId: string): string {
  assertPhotoId(photoId);
  return `previews/${photoId}/preview.webp`;
}
export function publicKeys(photoId: string) {
  assertPhotoId(photoId);
  return {
    displayKey: `photos/${photoId}/display.webp`,
    thumbnailKey: `photos/${photoId}/thumbnail.webp`,
  };
}
export function assertStorageKey(scope: StorageScope, key: string): void {
  const pattern =
    scope === "public"
      ? `^photos/${uuidPattern}/(display|thumbnail)\\.webp$`
      : `^(originals/${uuidPattern}/original\\.(jpg|png|webp)|previews/${uuidPattern}/preview\\.webp)$`;
  if (new RegExp(pattern).exec(key)?.[0] !== key)
    throw new StorageError("INVALID_KEY");
}
export function keyContentType(key: string): ImageMimeType {
  if (key.endsWith(".jpg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  return "image/webp";
}
export function assertOriginalKey(photoId: string, key: string) {
  assertPhotoId(photoId);
  assertStorageKey("private", key);
  if (
    !["jpeg", "png", "webp"].some(
      (format) => originalKey(photoId, format as ImageFormat) === key,
    )
  )
    throw new StorageError("INVALID_KEY");
}
