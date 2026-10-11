import "server-only";
import { assertStorageKey } from "./keys";
import { readStorageEnvironment, type StorageEnvironment } from "./environment";
export function getPublicImageUrl(
  key: string,
  environment: StorageEnvironment = readStorageEnvironment(),
): string {
  assertStorageKey("public", key);
  const path = key.split("/").map(encodeURIComponent).join("/");
  return environment.driver === "local"
    ? `/api/images/${path}`
    : `${environment.publicBaseURL}/${path}`;
}
