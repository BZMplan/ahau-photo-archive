import { afterAll, beforeAll, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { openDatabase } from "../../src/server/db/connection";
import {
  cachePurgeTasks,
  moderationLogs,
  photos,
  submissions,
} from "../../src/server/db/schema";
import { LocalStorage } from "../../src/server/storage/local";
import { SqliteOperationJournal } from "../../src/server/storage/journal";
import { ImageService } from "../../src/server/services/image-service";
import {
  ModerationService,
  type ModerationDependencies,
} from "../../src/server/services/moderation";
import { publicationKeys } from "../../src/server/storage/keys";
import { CatalogService } from "../../src/server/services/catalog";

let directory: string;
let database: ReturnType<typeof openDatabase>;
let privateStorage: LocalStorage;
let publicStorage: LocalStorage;
let imageService: ImageService;
let image: Buffer;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "ahau-moderation-test-"));
  database = openDatabase(join(directory, "archive.sqlite"));
  migrate(database.db, { migrationsFolder: "drizzle" });
  privateStorage = new LocalStorage(join(directory, "storage"), "private");
  publicStorage = new LocalStorage(join(directory, "storage"), "public");
  imageService = new ImageService(
    { private: privateStorage, public: publicStorage },
    new SqliteOperationJournal(database.db),
  );
  image = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#567" },
  })
    .png()
    .toBuffer();
});

afterAll(async () => {
  database.sqlite.close();
  await rm(directory, { recursive: true, force: true });
});

function deps(): ModerationDependencies {
  return {
    db: database.db,
    imageService: {
      publishImageVersion: async (photoId, sourceKey) => {
        const variants = await imageService.generateVariants(
          photoId,
          sourceKey,
        );
        const publicationId = randomUUID();
        const keys = publicationKeys(photoId, publicationId);
        await publicStorage.put(keys.displayKey, variants.display.buffer, {
          contentType: "image/webp",
          ifAbsent: true,
        });
        await publicStorage.put(keys.thumbnailKey, variants.thumbnail.buffer, {
          contentType: "image/webp",
          ifAbsent: true,
        });
        return { operationId: randomUUID(), publicationId, ...keys };
      },
      confirmVersionPublication: async () => undefined,
      unpublishPublication: async (_photoId, keys) => {
        await publicStorage.delete(keys.displayKey);
        await publicStorage.delete(keys.thumbnailKey);
      },
    },
    purge: async () => ({
      status: "not_configured",
      reason: "missing_credentials",
    }),
    now: () => new Date("2026-02-01T00:00:00.000Z"),
  };
}

async function fixture(title = "Campus library") {
  const source = await imageService.saveOriginal(image);
  const preview = await imageService.generatePreview(
    source.photoId,
    source.key,
  );
  const submission = database.db
    .insert(submissions)
    .values({
      authorName: "Archivist",
      attribution: "Archivist",
      consentAccepted: true,
    })
    .returning()
    .get();
  database.db
    .insert(photos)
    .values({
      id: source.photoId,
      submissionId: submission.id,
      title,
      originalKey: source.key,
      previewKey: preview.key,
      mimeType: source.metadata.mimeType,
      byteSize: source.metadata.size,
      width: source.metadata.width,
      height: source.metadata.height,
    })
    .run();
  return source.photoId;
}

test("approves pending photo, publishes versioned derivatives and records an audit log", async () => {
  const id = await fixture();
  const result = await new ModerationService(deps()).approvePhoto(
    id,
    "admin-1",
    new Headers(),
  );
  const photo = database.db
    .select()
    .from(photos)
    .where(eq(photos.id, id))
    .get();
  expect(result.status).toBe("approved");
  expect(photo?.status).toBe("approved");
  expect(photo?.publicationId).toMatch(/^[0-9a-f-]{36}$/);
  expect(photo?.displayKey).toContain(`photos/${id}/`);
  expect(await publicStorage.exists(photo!.displayKey!)).toBe(true);
  expect(await privateStorage.get(photo!.originalKey)).toEqual(image);
  expect(
    database.db
      .select()
      .from(moderationLogs)
      .all()
      .some((log) => log.action === "approve" && log.adminId === "admin-1"),
  ).toBe(true);
});

test("rejects pending photo and does not create public files", async () => {
  const id = await fixture("Reject me");
  const result = new ModerationService(deps()).rejectPhoto(
    id,
    "admin-2",
    "不符合档案范围",
  );
  const photo = database.db
    .select()
    .from(photos)
    .all()
    .find((item) => item.id === id);
  expect(result.status).toBe("rejected");
  expect(photo?.rejectionReason).toBe("不符合档案范围");
  expect(photo?.displayKey).toBeNull();
});

test("enforces state transitions and supports hide then restore with a new publication", async () => {
  const id = await fixture("Lifecycle");
  const service = new ModerationService(deps());
  await service.approvePhoto(id, "admin-3", new Headers());
  const first = database.db
    .select()
    .from(photos)
    .all()
    .find((item) => item.id === id)!;
  const hidden = await service.hidePhoto(
    id,
    "admin-3",
    new Headers(),
    "隐私申请",
  );
  expect(hidden.status).toBe("hidden");
  expect(
    database.db
      .select()
      .from(photos)
      .all()
      .find((item) => item.id === id)?.displayKey,
  ).toBeNull();
  expect(await publicStorage.exists(first.displayKey!)).toBe(false);
  expect(database.db.select().from(cachePurgeTasks).all().at(-1)?.status).toBe(
    "not_configured",
  );
  await service.restorePhoto(id, "admin-3", new Headers());
  const restored = database.db
    .select()
    .from(photos)
    .all()
    .find((item) => item.id === id)!;
  expect(restored.status).toBe("approved");
  expect(restored.publicationId).not.toBe(first.publicationId);
  await expect(
    service.approvePhoto(id, "admin-3", new Headers()),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

test("updates managed location and tag IDs and writes metadata changes to the audit log", async () => {
  const id = await fixture("Before");
  const service = new ModerationService(deps());
  const catalog = new CatalogService(database.db);
  const location = catalog.create("locations", { name: "图书馆" });
  const labels = [" 校园夜景 ", "秋季"].map((name) =>
    catalog.create("tags", { name }),
  );
  service.updateMetadata(id, "admin-4", {
    title: "After",
    description: "A record",
    takenAt: "2025-10-01",
    locationId: location.id,
    tagIds: labels.map((tag) => tag.id),
  });
  const detail = service.getPhoto(id);
  expect(detail.title).toBe("After");
  expect(detail.tags).toEqual(expect.arrayContaining(["秋季", "校园夜景"]));
  expect(detail.tags).toHaveLength(2);
  expect(
    service
      .listLogs(id)
      .some((log) => log.action === "edit" && log.metadataChanges.tags),
  ).toBe(true);
});

test("conditional update allows only one concurrent approval", async () => {
  const id = await fixture("Concurrent");
  const service = new ModerationService(deps());
  const results = await Promise.allSettled([
    service.approvePhoto(id, "admin-a", new Headers()),
    service.approvePhoto(id, "admin-b", new Headers()),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    1,
  );
  expect(
    service.listLogs(id).filter((log) => log.action === "approve"),
  ).toHaveLength(1);
});

test("a failed CDN purge is persisted and is not reported as a successful hide", async () => {
  const id = await fixture("Purge failure");
  const service = new ModerationService({
    ...deps(),
    purge: async () => ({ status: "failed", reason: "network" }),
  });
  await service.approvePhoto(id, "admin-purge", new Headers());
  await expect(
    service.hidePhoto(id, "admin-purge", new Headers()),
  ).rejects.toMatchObject({ code: "STORAGE_FAILURE" });
  expect(database.db.select().from(cachePurgeTasks).all().at(-1)?.status).toBe(
    "failed",
  );
  expect(
    database.db
      .select()
      .from(photos)
      .all()
      .find((photo) => photo.id === id)?.status,
  ).toBe("hidden");
});

test("publication receipt failure rolls the photo back to hidden and cleans derivatives", async () => {
  const id = await fixture("Receipt failure");
  const base = deps();
  const failing = new ModerationService({
    ...base,
    imageService: {
      ...base.imageService,
      confirmVersionPublication: async () => {
        throw new Error("receipt unavailable");
      },
    },
  });
  await expect(
    failing.approvePhoto(id, "admin-receipt", new Headers()),
  ).rejects.toMatchObject({ code: "STORAGE_FAILURE" });
  const photo = database.db
    .select()
    .from(photos)
    .all()
    .find((item) => item.id === id);
  expect(photo?.status).toBe("hidden");
  expect(photo?.displayKey).toBeNull();
});
