export type StorageScope = "private" | "public";
export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";
export interface StorageOptions {
  contentType: ImageMimeType;
  ifAbsent?: boolean;
}
export interface StoredObjectInfo {
  size: number;
  contentType: ImageMimeType;
  sha256?: string;
}
export interface ObjectStorage {
  readonly scope: StorageScope;
  put(key: string, data: Buffer, options: StorageOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  head(key: string): Promise<StoredObjectInfo>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
export interface StoragePair {
  private: ObjectStorage;
  public: ObjectStorage;
}
export const MAX_OBJECT_BYTES = 10 * 1024 * 1024;
export const PUBLIC_CACHE_CONTROL = "public, max-age=60, must-revalidate";
export const PRIVATE_CACHE_CONTROL = "private, no-store";
