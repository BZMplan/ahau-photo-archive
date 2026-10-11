export type StorageErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "UNAVAILABLE"
  | "IO_ERROR"
  | "INVALID_KEY"
  | "TOO_LARGE"
  | "CONFLICT";
export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) {
    super(`Object storage operation failed: ${code}.`);
    this.name = "StorageError";
  }
}
export function storageErrorCode(error: unknown): StorageErrorCode {
  return error instanceof StorageError ? error.code : "IO_ERROR";
}
