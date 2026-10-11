import "server-only";
import { readStorageEnvironment, type StorageEnvironment } from "./environment";
import { LocalStorage } from "./local";
import { createR2Client, R2Storage } from "./r2";
import type { StoragePair } from "./types";
export function createStorage(environment: StorageEnvironment): StoragePair {
  if (environment.driver === "local")
    return {
      private: new LocalStorage(environment.root, "private"),
      public: new LocalStorage(environment.root, "public"),
    };
  const client = createR2Client(environment);
  return {
    private: new R2Storage(client, environment.privateBucket, "private"),
    public: new R2Storage(client, environment.publicBucket, "public"),
  };
}
let storage: StoragePair | undefined;
export function getStorage(): StoragePair {
  return (storage ??= createStorage(readStorageEnvironment()));
}
