import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "../../src/server/db";
import {
  photos,
  submissions,
  imageOperations,
} from "../../src/server/db/schema";
import { getAuth } from "../../src/server/auth";
import { LocalStorage } from "../../src/server/storage/local";
import { getStorage } from "../../src/server/storage";
import { SqliteOperationJournal } from "../../src/server/storage/journal";
import {
  ImageService,
  ImageOperationError,
} from "../../src/server/services/image-service";
import {
  originalKey,
  previewKey,
  publicKeys,
} from "../../src/server/storage/keys";
import { StorageError } from "../../src/server/storage/errors";
import { GET as preview } from "../../src/app/api/admin/photos/[id]/preview/route";
import { GET as publicImage } from "../../src/app/api/images/[...key]/route";

let directory: string,
  service: ImageService,
  privateStorage: LocalStorage,
  publicStorage: LocalStorage,
  journal: SqliteOperationJournal;
let adminHeaders: Headers, visitorHeaders: Headers, input: Buffer;
const origin = "http://localhost:3000";
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "ahau-image-service-test-"));
  vi.stubEnv("DATABASE_PATH", join(directory, "archive.sqlite"));
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("LOCAL_STORAGE_PATH", join(directory, "storage"));
  vi.stubEnv("BETTER_AUTH_URL", origin);
  vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(48).toString("base64url"));
  migrate(getDb(), { migrationsFolder: "drizzle" });
  const password = randomBytes(32).toString("base64url");
  for (const role of ["admin", "user"] as const) {
    const email = `${role}@example.invalid`;
    await getAuth().api.createUser({
      body: { name: "Image integration fixture", email, password, role },
    });
    const response = await getAuth().handler(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(response.status).toBe(200);
    const headers = new Headers({
      Cookie: response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; "),
    });
    if (role === "admin") adminHeaders = headers;
    else visitorHeaders = headers;
  }
  input = await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#356749" },
  })
    .png()
    .toBuffer();
});
beforeEach(() => {
  vi.restoreAllMocks();
  privateStorage = new LocalStorage(join(directory, "storage"), "private");
  publicStorage = new LocalStorage(join(directory, "storage"), "public");
  journal = new SqliteOperationJournal(getDb());
  service = new ImageService(
    { private: privateStorage, public: publicStorage },
    journal,
  );
});
afterAll(async () => {
  getDb().$client.close();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function storedPhoto() {
  const saved = await service.saveOriginal(input);
  const generated = await service.generatePreview(saved.photoId, saved.key);
  const submission = getDb()
    .insert(submissions)
    .values({ attribution: "Generated test fixture" })
    .returning()
    .get();
  getDb()
    .insert(photos)
    .values({
      id: saved.photoId,
      submissionId: submission.id,
      title: "Generated test image",
      originalKey: saved.key,
      previewKey: generated.key,
      mimeType: saved.metadata.mimeType,
      byteSize: saved.metadata.size,
      width: saved.metadata.width,
      height: saved.metadata.height,
    })
    .run();
  return saved;
}
function previewRequest(id: string, headers = new Headers()) {
  return preview(
    new Request(`${origin}/api/admin/photos/${id}/preview`, { headers }),
    { params: Promise.resolve({ id }) },
  );
}
function imageRequest(key: string) {
  return publicImage(new Request(`${origin}/api/images/${key}`), {
    params: Promise.resolve({ key: key.split("/") }),
  });
}

test("saves exact original bytes with an actual PNG extension, private preview and no public files", async () => {
  const saved = await service.saveOriginal(input);
  expect(saved.key).toBe(originalKey(saved.photoId, "png"));
  expect(await service.getPrivateImage(saved.photoId, saved.key)).toEqual(
    input,
  );
  const generated = await service.generatePreview(saved.photoId, saved.key);
  expect(generated.key).toBe(previewKey(saved.photoId));
  expect((await sharp(generated.buffer).metadata()).format).toBe("webp");
  expect(await publicStorage.exists(publicKeys(saved.photoId).displayKey)).toBe(
    false,
  );
});
test("rejects invalid originals before a storage write", async () => {
  const write = vi.spyOn(privateStorage, "put");
  await expect(service.saveOriginal(Buffer.from("bad"))).rejects.toMatchObject({
    code: "UNSUPPORTED_FORMAT",
  });
  expect(write).not.toHaveBeenCalled();
});
test("originals are immutable and repeat identical saves are idempotent", async () => {
  const saved = await service.saveOriginal(input);
  await service.saveOriginal(input, saved.photoId);
  const other = await sharp(input).negate().png().toBuffer();
  await expect(
    service.saveOriginal(other, saved.photoId),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await privateStorage.get(saved.key)).toEqual(input);
});
test("cannot publish without a current real administrator session", async () => {
  const saved = await service.saveOriginal(input);
  const put = vi.spyOn(publicStorage, "put");
  await expect(
    service.publishImage(saved.photoId, saved.key, new Headers()),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    service.publishImage(saved.photoId, saved.key, visitorHeaders),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    service.publishImage(
      saved.photoId,
      saved.key,
      new Headers({ role: "admin" }),
    ),
  ).rejects.toMatchObject({ status: 401 });
  expect(put).not.toHaveBeenCalled();
});
test("publication returns a receipt only after both writes and never changes business status", async () => {
  const saved = await storedPhoto();
  const receipt = await service.publishImage(
    saved.photoId,
    saved.key,
    adminHeaders,
  );
  expect(await publicStorage.exists(receipt.displayKey)).toBe(true);
  expect(await publicStorage.exists(receipt.thumbnailKey)).toBe(true);
  expect(journal.find(receipt.operationId)?.state).toBe("awaiting_commit");
  expect(
    getDb().select().from(photos).where(eq(photos.id, saved.photoId)).get()
      ?.status,
  ).toBe("pending");
  // Simulate the future business transaction; it is intentionally outside ImageService.
  getDb()
    .update(photos)
    .set({
      status: "approved",
      displayKey: receipt.displayKey,
      thumbnailKey: receipt.thumbnailKey,
      publishedAt: new Date(),
    })
    .where(eq(photos.id, saved.photoId))
    .run();
  await service.confirmPublication(receipt, adminHeaders);
  expect(journal.find(receipt.operationId)?.state).toBe("complete");
});
test("repeat and concurrent publication reuse deterministic objects", async () => {
  const saved = await service.saveOriginal(input);
  const put = vi.spyOn(publicStorage, "put");
  const receipts = await Promise.all([
    service.publishImage(saved.photoId, saved.key, adminHeaders),
    service.publishImage(saved.photoId, saved.key, adminHeaders),
  ]);
  expect(receipts[0].displayKey).toBe(receipts[1].displayKey);
  expect(put).toHaveBeenCalledTimes(2);
});
test("partial upload failure cleans all attempted public objects and retains original", async () => {
  const saved = await storedPhoto();
  const actual = publicStorage.put.bind(publicStorage);
  vi.spyOn(publicStorage, "put").mockImplementation(
    async (key, bytes, options) => {
      await actual(key, bytes, options);
      if (key.endsWith("thumbnail.webp")) throw new StorageError("UNAVAILABLE");
    },
  );
  await expect(
    service.publishImage(saved.photoId, saved.key, adminHeaders),
  ).rejects.toBeInstanceOf(ImageOperationError);
  for (const key of Object.values(publicKeys(saved.photoId)))
    expect(await publicStorage.exists(key)).toBe(false);
  expect(await privateStorage.get(saved.key)).toEqual(input);
  expect(
    getDb().select().from(photos).where(eq(photos.id, saved.photoId)).get()
      ?.status,
  ).toBe("pending");
});
test("cleanup failure persists a recoverable record and retry works after restart", async () => {
  const saved = await service.saveOriginal(input);
  const actual = publicStorage.put.bind(publicStorage);
  vi.spyOn(publicStorage, "put").mockImplementation(
    async (key, bytes, options) => {
      await actual(key, bytes, options);
      if (key.endsWith("thumbnail.webp")) throw new StorageError("UNAVAILABLE");
    },
  );
  vi.spyOn(publicStorage, "delete").mockRejectedValue(
    new StorageError("FORBIDDEN"),
  );
  let operationId = "";
  try {
    await service.publishImage(saved.photoId, saved.key, adminHeaders);
    throw new Error("Expected failed publication");
  } catch (error) {
    expect(error).toBeInstanceOf(ImageOperationError);
    operationId = (error as ImageOperationError).operationId;
  }
  expect(journal.find(operationId)).toMatchObject({
    state: "cleanup_failed",
    photoId: saved.photoId,
    errorCode: "CLEANUP_FAILED",
  });
  expect(journal.find(operationId)?.objects).toHaveLength(2);
  vi.restoreAllMocks();
  const restarted = new ImageService(
    { private: privateStorage, public: publicStorage },
    new SqliteOperationJournal(getDb()),
  );
  await restarted.recoverOperation(operationId, "remove", adminHeaders);
  expect(journal.find(operationId)?.state).toBe("complete");
  for (const key of Object.values(publicKeys(saved.photoId)))
    expect(await publicStorage.exists(key)).toBe(false);
});
test("database failure can compensate an awaiting-commit publication", async () => {
  const saved = await service.saveOriginal(input);
  const receipt = await service.publishImage(
    saved.photoId,
    saved.key,
    adminHeaders,
  );
  await service.recoverOperation(receipt.operationId, "remove", adminHeaders);
  expect(await publicStorage.exists(receipt.displayKey)).toBe(false);
  expect(await privateStorage.exists(saved.key)).toBe(true);
});
test("journal failure prevents public uploads", async () => {
  const saved = await service.saveOriginal(input);
  vi.spyOn(journal, "begin").mockImplementation(() => {
    throw new Error("journal unavailable");
  });
  const put = vi.spyOn(publicStorage, "put");
  await expect(
    service.publishImage(saved.photoId, saved.key, adminHeaders),
  ).rejects.toThrow(/journal unavailable/);
  expect(put).not.toHaveBeenCalled();
});
test("existing different published content is preserved on conflict", async () => {
  const saved = await service.saveOriginal(input);
  const key = publicKeys(saved.photoId).displayKey;
  const old = Buffer.from("pre-existing object");
  await publicStorage.put(key, old, { contentType: "image/webp" });
  await expect(
    service.publishImage(saved.photoId, saved.key, adminHeaders),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await publicStorage.get(key)).toEqual(old);
});
test("unpublish retains original and preview; permanent delete is idempotent", async () => {
  const saved = await service.saveOriginal(input);
  const generated = await service.generatePreview(saved.photoId, saved.key);
  const receipt = await service.publishImage(
    saved.photoId,
    saved.key,
    adminHeaders,
  );
  await service.unpublishImage(saved.photoId, adminHeaders);
  await service.unpublishImage(saved.photoId, adminHeaders);
  expect(await publicStorage.exists(receipt.displayKey)).toBe(false);
  expect(await privateStorage.exists(saved.key)).toBe(true);
  expect(await privateStorage.exists(generated.key)).toBe(true);
  await service.deleteImageFiles(saved.photoId, adminHeaders);
  await service.deleteImageFiles(saved.photoId, adminHeaders);
  expect(await privateStorage.exists(saved.key)).toBe(false);
  expect(await privateStorage.exists(generated.key)).toBe(false);
});
test("preview authenticates before looking up or reading a private object", async () => {
  const get = vi.spyOn(getStorage().private, "get");
  expect((await previewRequest(randomUUID())).status).toBe(401);
  expect((await previewRequest(randomUUID(), visitorHeaders)).status).toBe(403);
  expect(get).not.toHaveBeenCalled();
});
test("admin preview reads only the database-approved private preview key with no-store", async () => {
  const saved = await storedPhoto();
  const response = await previewRequest(saved.photoId, adminHeaders);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/webp");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(
    await privateStorage.get(previewKey(saved.photoId)),
  );
  expect((await previewRequest(randomUUID(), adminHeaders)).status).toBe(404);
});
test("preview cannot select an arbitrary key, including forged database keys", async () => {
  const saved = await storedPhoto();
  getDb()
    .update(photos)
    .set({ previewKey: originalKey(saved.photoId, "png") })
    .where(eq(photos.id, saved.photoId))
    .run();
  expect((await previewRequest(saved.photoId, adminHeaders)).status).toBe(404);
  expect((await previewRequest("..", adminHeaders)).status).toBe(404);
});
test("local public route gates files by approval and refuses traversal or private paths", async () => {
  const saved = await storedPhoto();
  const receipt = await service.publishImage(
    saved.photoId,
    saved.key,
    adminHeaders,
  );
  expect((await imageRequest(receipt.displayKey)).status).toBe(404);
  getDb()
    .update(photos)
    .set({
      status: "approved",
      displayKey: receipt.displayKey,
      thumbnailKey: receipt.thumbnailKey,
      publishedAt: new Date(),
    })
    .where(eq(photos.id, saved.photoId))
    .run();
  const response = await imageRequest(receipt.displayKey);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/webp");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(
    await publicStorage.get(receipt.displayKey),
  );
  getDb()
    .update(photos)
    .set({ status: "hidden" })
    .where(eq(photos.id, saved.photoId))
    .run();
  expect((await imageRequest(receipt.displayKey)).status).toBe(404);
  for (const key of [
    saved.key,
    previewKey(saved.photoId),
    `photos/${saved.photoId}/../../private/secret`,
    `photos/%2e%2e/display.webp`,
  ])
    expect((await imageRequest(key)).status).toBe(404);
});
test("journal records survive a new journal instance", () => {
  const id = randomUUID();
  const record = journal.begin(id, "unpublish", [
    { scope: "public", key: publicKeys(id).displayKey },
  ]);
  expect(new SqliteOperationJournal(getDb()).find(record.id)).toMatchObject({
    state: "writing",
    photoId: id,
  });
  expect(getDb().select().from(imageOperations).all().length).toBeGreaterThan(
    0,
  );
});

test("recovery keeps a publication that crashed before receipt bookkeeping", async () => {
  const saved = await service.saveOriginal(input);
  const receipt = await service.publishImage(
    saved.photoId,
    saved.key,
    adminHeaders,
  );
  journal.update(receipt.operationId, "writing");
  await service.recoverOperation(receipt.operationId, "keep", adminHeaders);
  expect(journal.find(receipt.operationId)?.state).toBe("complete");
  expect(await publicStorage.exists(receipt.displayKey)).toBe(true);
});
test("an original cannot be replaced with a different encoding under the same ID", async () => {
  const saved = await service.saveOriginal(input);
  await expect(
    service.saveOriginal(await sharp(input).jpeg().toBuffer(), saved.photoId),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await privateStorage.get(saved.key)).toEqual(input);
});

test("failed receipt bookkeeping cleans objects and preserves the pre-upload recovery record", async () => {
  const saved = await service.saveOriginal(input);
  vi.spyOn(journal, "update").mockImplementation(() => {
    throw new Error("SQLite temporarily unavailable");
  });
  let operationId = "";
  try {
    await service.publishImage(saved.photoId, saved.key, adminHeaders);
    throw new Error("Expected failed publication");
  } catch (error) {
    expect(error).toBeInstanceOf(ImageOperationError);
    expect((error as ImageOperationError).code).toBe("JOURNAL_FAILED");
    operationId = (error as ImageOperationError).operationId;
  }
  expect(journal.find(operationId)?.state).toBe("writing");
  for (const key of Object.values(publicKeys(saved.photoId)))
    expect(await publicStorage.exists(key)).toBe(false);
  expect(await privateStorage.get(saved.key)).toEqual(input);
});
