import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtemp, rm, mkdir, symlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalStorage } from "../../src/server/storage/local";
import {
  originalKey,
  previewKey,
  publicKeys,
  assertStorageKey,
} from "../../src/server/storage/keys";
import { readStorageEnvironment } from "../../src/server/storage/environment";
import { getPublicImageUrl } from "../../src/server/storage/urls";
let directory: string,
  privateStorage: LocalStorage,
  publicStorage: LocalStorage;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ahau-local-test-"));
  privateStorage = new LocalStorage(directory, "private");
  publicStorage = new LocalStorage(directory, "public");
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
test("writes and reads private originals byte for byte and provides metadata", async () => {
  const key = originalKey(randomUUID(), "png"),
    data = Buffer.from("adapter-level test bytes");
  await privateStorage.put(key, data, { contentType: "image/png" });
  expect(await privateStorage.get(key)).toEqual(data);
  expect(await privateStorage.head(key)).toMatchObject({
    size: data.length,
    contentType: "image/png",
  });
  expect(await privateStorage.exists(key)).toBe(true);
});
test("private previews and public variants are separate", async () => {
  const id = randomUUID();
  await privateStorage.put(previewKey(id), Buffer.from("preview"), {
    contentType: "image/webp",
  });
  await publicStorage.put(publicKeys(id).displayKey, Buffer.from("display"), {
    contentType: "image/webp",
  });
  expect(await publicStorage.get(publicKeys(id).displayKey)).toEqual(
    Buffer.from("display"),
  );
  await expect(publicStorage.get(previewKey(id))).rejects.toMatchObject({
    code: "INVALID_KEY",
  });
  await expect(
    privateStorage.get(publicKeys(id).displayKey),
  ).rejects.toMatchObject({ code: "INVALID_KEY" });
});
test("deletion and repeated deletion are idempotent", async () => {
  const key = originalKey(randomUUID(), "jpeg");
  await privateStorage.put(key, Buffer.from("bytes"), {
    contentType: "image/jpeg",
  });
  await privateStorage.delete(key);
  await privateStorage.delete(key);
  expect(await privateStorage.exists(key)).toBe(false);
  await expect(privateStorage.get(key)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
test.each([
  "../private/secret",
  "/etc/passwd",
  "photos/../../private/x",
  "photos/%2e%2e/x",
  "https://evil.example/x",
  "photos/not-uuid/display.webp",
  "photos/00000000-0000-4000-8000-000000000000/display.webp\n",
  "photos/00000000-0000-4000-8000-000000000000/original.jpg",
])("rejects unsafe key %s", async (key) => {
  await expect(publicStorage.get(key)).rejects.toMatchObject({
    code: "INVALID_KEY",
  });
  expect(() => assertStorageKey("public", key)).toThrow();
});
test("refuses symlink directories and files", async () => {
  const id = randomUUID();
  await mkdir(join(directory, "outside"));
  await mkdir(join(directory, "private", "originals"), { recursive: true });
  await symlink(
    join(directory, "outside"),
    join(directory, "private", "originals", id),
  );
  await expect(
    privateStorage.put(originalKey(id, "png"), Buffer.from("secret"), {
      contentType: "image/png",
    }),
  ).rejects.toMatchObject({ code: "INVALID_KEY" });
});
test("atomic create-if-absent preserves original bytes", async () => {
  const key = originalKey(randomUUID(), "jpeg");
  await privateStorage.put(key, Buffer.from("first"), {
    contentType: "image/jpeg",
    ifAbsent: true,
  });
  await expect(
    privateStorage.put(key, Buffer.from("second"), {
      contentType: "image/jpeg",
      ifAbsent: true,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await privateStorage.get(key)).toEqual(Buffer.from("first"));
  expect(await readFile(join(directory, "private", key))).toEqual(
    Buffer.from("first"),
  );
});
test("local is the default and explicit R2 never falls back", () => {
  expect(readStorageEnvironment({ NODE_ENV: "development" }).driver).toBe(
    "local",
  );
  expect(readStorageEnvironment({ NODE_ENV: "production" }).driver).toBe(
    "local",
  );
  expect(() =>
    readStorageEnvironment({ NODE_ENV: "production", STORAGE_DRIVER: "r2" }),
  ).toThrow(/R2_ACCOUNT_ID/);
  expect(
    readStorageEnvironment({
      NODE_ENV: "production",
      STORAGE_DRIVER: "local",
      LOCAL_STORAGE_PATH: directory,
    }).driver,
  ).toBe("local");
  expect(() => readStorageEnvironment({ STORAGE_DRIVER: "unknown" })).toThrow(
    /STORAGE_DRIVER/,
  );
  expect(() =>
    readStorageEnvironment({
      STORAGE_DRIVER: "local",
      LOCAL_STORAGE_PATH: "public/storage",
    }),
  ).toThrow(/outside/);
});
test("public URL generation accepts only public canonical keys", () => {
  const key = publicKeys(randomUUID()).thumbnailKey;
  expect(getPublicImageUrl(key, { driver: "local", root: directory })).toBe(
    `/api/images/${key}`,
  );
  expect(() =>
    getPublicImageUrl(previewKey(randomUUID()), {
      driver: "local",
      root: directory,
    }),
  ).toThrow();
});

test("rejects leaf symlinks without reading their targets", async () => {
  const id = randomUUID(),
    key = originalKey(id, "jpeg");
  await mkdir(join(directory, "private", "originals", id), { recursive: true });
  await symlink(import.meta.filename, join(directory, "private", key));
  await expect(privateStorage.get(key)).rejects.toMatchObject({
    code: "IO_ERROR",
  });
  await expect(privateStorage.delete(key)).rejects.toMatchObject({
    code: "INVALID_KEY",
  });
});
