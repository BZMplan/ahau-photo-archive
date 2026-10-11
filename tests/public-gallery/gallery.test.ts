import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../../src/server/db/connection";
import {
  photos,
  submissions,
  tags,
  photoTags,
  moderationLogs,
} from "../../src/server/db/schema";
import {
  getPublishedPhotos,
  getPublishedPhotoById,
  getArchiveFilters,
  getPublishedTags,
  getPublishedTagBySlug,
  getRelatedPhotos,
} from "../../src/server/services/public-photos";
import {
  parseArchiveQuery,
  archiveHref,
} from "../../src/lib/validations/archive";
import { getPublicImageUrl } from "../../src/server/storage/urls";
import { publicationKeys } from "../../src/server/storage/keys";
import type { StorageEnvironment } from "../../src/server/storage/environment";
import { ModerationService } from "../../src/server/services/moderation";

let database: ReturnType<typeof openDatabase>;
let directory: string;
vi.mock("../../src/server/db", () => ({ getDb: () => database.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "ahau-gallery-"));
  database = openDatabase(join(directory, "test.sqlite"));
  migrate(database.db, { migrationsFolder: "drizzle" });
  migrate(database.db, { migrationsFolder: "drizzle" });
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("LOCAL_STORAGE_PATH", join(directory, "storage"));
});
beforeEach(() => {
  database.db.delete(moderationLogs).run();
  database.db.delete(photoTags).run();
  database.db.delete(photos).run();
  database.db.delete(submissions).run();
  database.db.delete(tags).run();
});
afterAll(() => {
  database.sqlite.close();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
function photo(values: Partial<typeof photos.$inferInsert> = {}) {
  const id = randomUUID();
  const sub = database.db
    .insert(submissions)
    .values({
      authorName: "摄影者",
      contactEmail: "secret@example.invalid",
      message: "private note",
    })
    .returning()
    .get();
  return database.db
    .insert(photos)
    .values({
      id,
      submissionId: sub.id,
      title: "校园",
      description: "晨光",
      location: "图书馆",
      takenAt: "2025-10-01",
      originalKey: "originals/" + id + "/original.jpg",
      previewKey: "previews/" + id + "/preview.webp",
      mimeType: "image/jpeg",
      byteSize: 100,
      status: "approved",
      ...publicationKeys(id, randomUUID()),
      publishedAt: new Date("2026-01-01T00:00:00Z"),
      width: 1200,
      height: 800,
      ...values,
    })
    .returning()
    .get();
}
function tag(id: string, name = "建筑", slug = "architecture") {
  const row =
    database.db.select().from(tags).where(eq(tags.slug, slug)).get() ??
    database.db.insert(tags).values({ name, slug }).returning().get();
  database.db.insert(photoTags).values({ photoId: id, tagId: row.id }).run();
}
test.each(["pending", "rejected", "hidden"] as const)(
  "%s never appears in public queries, filters, tags or related results",
  (status) => {
    const item = photo({ status, location: "私密地点", takenAt: "1999-01-01" });
    tag(item.id);
    expect(getPublishedPhotoById(item.id)).toBeUndefined();
    expect(getPublishedPhotos().total).toBe(0);
    expect(getPublishedTags()).toEqual([]);
    expect(getArchiveFilters()).toEqual({ years: [], locations: [], tags: [] });
    expect(getRelatedPhotos(item.id)).toEqual([]);
  },
);
test("approved DTO has only public whitelisted fields, optional metadata and linked tags", () => {
  const item = photo();
  tag(item.id);
  const dto = getPublishedPhotoById(item.id)!;
  expect(Object.keys(dto).sort()).toEqual(
    [
      "id",
      "title",
      "description",
      "location",
      "takenAt",
      "publishedAt",
      "attribution",
      "displayUrl",
      "thumbnailUrl",
      "width",
      "height",
      "tags",
      "tagSlugs",
    ].sort(),
  );
  expect(dto).toMatchObject({
    width: 1200,
    height: 800,
    attribution: "摄影者",
    takenAt: "2025-10-01",
    tags: ["建筑"],
    tagSlugs: ["architecture"],
  });
  expect(JSON.stringify(dto)).not.toMatch(
    /secret|private note|originals|previews|reviewedBy|rejectionReason/,
  );
  expect(getPublishedPhotoById(randomUUID())).toBeUndefined();
  const optional = photo({
    takenAt: null,
    location: null,
    description: null,
    width: null,
    height: null,
  });
  expect(getPublishedPhotoById(optional.id)).toMatchObject({
    takenAt: null,
    location: null,
    description: null,
  });
});
test("year, season, normalized location and tag filters combine in SQL", () => {
  const wanted = photo({ location: "  Campus\t Library  " });
  tag(wanted.id);
  photo({ takenAt: "2024-07-01" });
  photo({ takenAt: null });
  expect(getPublishedPhotos({ year: "2025" }).items.map((p) => p.id)).toEqual([
    wanted.id,
  ]);
  expect(getPublishedPhotos({ season: "autumn" }).total).toBe(1);
  expect(getPublishedPhotos({ location: "CAMPUS   LIBRARY" }).total).toBe(1);
  expect(getPublishedPhotos({ tag: "architecture" }).total).toBe(1);
  expect(
    getPublishedPhotos({
      year: "2025",
      season: "autumn",
      location: "campus library",
      tag: "architecture",
    }).total,
  ).toBe(1);
  expect(getPublishedPhotos({ year: "2025", season: "summer" }).total).toBe(0);
  expect(getArchiveFilters().years).toEqual(["2025", "2024"]);
  expect(getArchiveFilters().locations).toContain("campus library");
});
test.each([
  ["spring", [3, 4, 5]],
  ["summer", [6, 7, 8]],
  ["autumn", [9, 10, 11]],
  ["winter", [1, 2, 12]],
])(
  "season %s respects calendar months and excludes null dates",
  (season, months) => {
    for (let month = 1; month <= 12; month++)
      photo({ takenAt: "2025-" + String(month).padStart(2, "0") + "-01" });
    photo({ takenAt: null });
    const result = getPublishedPhotos({ season, sort: "taken-asc" });
    expect(result.items.map((p) => Number(p.takenAt!.slice(5, 7)))).toEqual(
      months,
    );
  },
);
test("location facets deduplicate all whitespace, casing and exclude empty values", () => {
  photo({ location: " North\tGate " });
  photo({ location: "north  gate" });
  photo({ location: " 　" });
  photo({ location: null });
  expect(getArchiveFilters().locations).toEqual(["north gate"]);
  expect(getPublishedPhotos({ location: "NORTH GATE" }).total).toBe(2);
});
test("invalid fields are ignored independently; size capped and empty GET values work", () => {
  expect(
    parseArchiveQuery({
      year: "2025",
      season: "bad",
      page: "NaN",
      pageSize: 999,
    }),
  ).toMatchObject({ year: "2025", season: undefined, page: 1, pageSize: 60 });
  expect(parseArchiveQuery({ year: ["2025"], page: Infinity }).page).toBe(1);
  expect(
    parseArchiveQuery({ year: "2025", location: "", tag: "", season: "" }).year,
  ).toBe("2025");
  photo();
  expect(getPublishedPhotos({ location: "' OR 1=1 --" }).total).toBe(0);
  expect(archiveHref(parseArchiveQuery({ year: "2025", page: 8 }), 1)).toBe(
    "/archive?year=2025",
  );
  expect(archiveHref(parseArchiveQuery({ tag: "建筑" }), 2, "/tags/建筑")).toBe(
    "/tags/建筑?page=2",
  );
});
test("publication and capture sorting differ, null dates always last and equal timestamps stable", () => {
  const a = photo({
    takenAt: "2022-01-01",
    publishedAt: new Date("2026-01-02"),
  });
  const b = photo({
    takenAt: "2025-01-01",
    publishedAt: new Date("2026-01-01"),
  });
  const c = photo({ takenAt: null, publishedAt: new Date("2026-01-01") });
  expect(getPublishedPhotos().items[0].id).toBe(a.id);
  expect(getPublishedPhotos({ sort: "published-asc" }).items.at(-1)?.id).toBe(
    a.id,
  );
  expect(
    getPublishedPhotos({ sort: "taken-desc" }).items.map((p) => p.id),
  ).toEqual([b.id, a.id, c.id]);
  expect(
    getPublishedPhotos({ sort: "taken-asc" }).items.map((p) => p.id),
  ).toEqual([a.id, b.id, c.id]);
  const all = getPublishedPhotos().items.map((p) => p.id);
  expect(
    [1, 2, 3].flatMap((page) =>
      getPublishedPhotos({ page, pageSize: 1 }).items.map((p) => p.id),
    ),
  ).toEqual(all);
  expect(getPublishedPhotos({ page: 4, pageSize: 1 }).items).toEqual([]);
});
test("default/max pagination and public tag counts", () => {
  for (let i = 0; i < 65; i++) {
    const p = photo();
    tag(p.id);
  }
  tag(photo({ status: "hidden" }).id);
  expect(getPublishedPhotos().items).toHaveLength(24);
  expect(getPublishedPhotos({ pageSize: 1000 }).items).toHaveLength(60);
  expect(getPublishedPhotos({ page: 3 }).items).toHaveLength(17);
  expect(getPublishedTags()).toEqual([
    { name: "建筑", slug: "architecture", count: 65 },
  ]);
  expect(getPublishedTagBySlug("architecture")?.count).toBe(65);
  expect(getPublishedTagBySlug("missing")).toBeUndefined();
});
test("related results exclude current/nonpublic images", () => {
  const source = photo();
  const related = photo();
  photo({ status: "hidden" });
  expect(getRelatedPhotos(source.id).map((p) => p.id)).toEqual([related.id]);
});
test("local/R2 URLs use public versions only; missing R2 config is an error", () => {
  const key = publicationKeys(randomUUID(), randomUUID()).displayKey;
  expect(getPublicImageUrl(key, { driver: "local", root: directory })).toBe(
    "/api/images/" + key,
  );
  const r2: StorageEnvironment = {
    driver: "r2",
    accountId: "a".repeat(32),
    accessKeyId: "mock",
    secretAccessKey: "mock",
    privateBucket: "private",
    publicBucket: "public",
    publicBaseURL: "https://images.example.invalid",
  };
  expect(getPublicImageUrl(key, r2)).toBe(
    "https://images.example.invalid/" + key,
  );
  expect(() =>
    getPublicImageUrl("originals/" + randomUUID() + "/original.jpg", r2),
  ).toThrow();
  photo();
  vi.stubEnv("STORAGE_DRIVER", "r2");
  vi.stubEnv("R2_ACCOUNT_ID", "");
  expect(() => getPublishedPhotos()).toThrow(/R2_ACCOUNT_ID/);
  vi.stubEnv("STORAGE_DRIVER", "local");
});
test("moderation approve/hide/restore immediately changes public reads and versions", async () => {
  const item = photo({
    status: "pending",
    displayKey: null,
    thumbnailKey: null,
    publishedAt: null,
  });
  const service = new ModerationService({
    db: database.db,
    now: () => new Date(),
    purge: async () => ({
      status: "not_configured",
      reason: "missing_credentials",
    }),
    imageService: {
      publishImageVersion: async (id) => {
        const publicationId = randomUUID();
        return {
          operationId: randomUUID(),
          publicationId,
          ...publicationKeys(id, publicationId),
        };
      },
      confirmVersionPublication: async () => undefined,
      unpublishPublication: async () => undefined,
    },
  });
  expect(getPublishedPhotoById(item.id)).toBeUndefined();
  await service.approvePhoto(item.id, "admin-test", new Headers());
  const url = getPublishedPhotoById(item.id)!.displayUrl;
  expect(getPublishedPhotos().total).toBe(1);
  await service.hidePhoto(item.id, "admin-test", new Headers());
  expect(getPublishedPhotoById(item.id)).toBeUndefined();
  expect(getPublishedPhotos().total).toBe(0);
  await service.restorePhoto(item.id, "admin-test", new Headers());
  expect(getPublishedPhotoById(item.id)!.displayUrl).not.toBe(url);
});
