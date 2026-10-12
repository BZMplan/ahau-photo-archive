import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../../src/server/db/connection";
import {
  photos,
  tags,
  photoTags,
  submissions,
  submissionOperations,
} from "../../src/server/db/schema";
import {
  CatalogService,
  validateCatalogSelection,
} from "../../src/server/services/catalog";
import {
  SubmissionService,
  type CreateSubmissionInput,
  type SubmissionDependencies,
} from "../../src/server/services/submissions";
import { ModerationService } from "../../src/server/services/moderation";
import {
  getPublishedPhotoById,
  getPublishedPhotos,
  getArchiveFilters,
} from "../../src/server/services/public-photos";
import {
  adminCatalogGet,
  adminCatalogPost,
  adminCatalogPatch,
  publicCatalogGet,
} from "../../src/server/api/catalog";
import type { CatalogKind } from "../../src/types/catalog";
import { publicationKeys } from "../../src/server/storage/keys";

let directory: string;
let database: ReturnType<typeof openDatabase>;
let catalog: CatalogService;
const authState = vi.hoisted(() => ({ role: "admin" as string | null }));
vi.mock("../../src/server/db", () => ({ getDb: () => database.db }));
vi.mock("../../src/server/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: async () =>
        authState.role
          ? { user: { id: "admin-1", role: authState.role }, session: {} }
          : null,
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "ahau-catalog-"));
  database = openDatabase(join(directory, "archive.sqlite"));
  migrate(database.db, { migrationsFolder: "drizzle" });
  catalog = new CatalogService(database.db);
  authState.role = "admin";
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "catalog-test-only-secret-with-at-least-32-characters",
  );
  vi.stubEnv("STORAGE_DRIVER", "local");
});
afterEach(() => {
  database.sqlite.close();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
const kinds: CatalogKind[] = ["locations", "tags"];
function request(kind: CatalogKind, method: string, body?: unknown) {
  return new Request(`http://localhost:3000/api/admin/${kind}`, {
    method,
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
test.each(kinds)(
  "%s API enforces session/role on all read/write routes",
  async (kind) => {
    for (const [role, status] of [
      [null, 401],
      ["user", 403],
    ] as const) {
      authState.role = role;
      for (const response of [
        await adminCatalogGet(kind)(request(kind, "GET")),
        await adminCatalogPost(kind)(
          request(kind, "POST", { name: "地点", role: "admin" }),
        ),
        await adminCatalogPatch(kind)(
          request(kind, "PATCH", { isActive: false }),
          { params: Promise.resolve({ id: randomUUID() }) },
        ),
      ]) {
        expect(response.status).toBe(status);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
      }
    }
    expect(catalog.list(kind).total).toBe(0);
  },
);
test.each(kinds)(
  "%s admin can create/edit/disable/restore with usage count",
  async (kind) => {
    const created = await adminCatalogPost(kind)(
      request(kind, "POST", {
        name: " 图书馆 ",
        description: "说明",
        sortOrder: 3,
      }),
    );
    expect(created.status).toBe(201);
    const {
      data: { item },
    } = await created.json();
    expect(item.name).toBe("图书馆");
    const id = item.id as string;
    const patch = (value: unknown) =>
      adminCatalogPatch(kind)(request(kind, "PATCH", value), {
        params: Promise.resolve({ id }),
      });
    expect(
      (await patch({ name: "图书馆东侧", description: "新说明" })).status,
    ).toBe(200);
    expect((await patch({ isActive: false })).status).toBe(200);
    expect(catalog.search(kind)).toEqual([]);
    expect((await patch({ isActive: true })).status).toBe(200);
    const listed = await adminCatalogGet(kind)(request(kind, "GET"));
    expect((await listed.json()).data.items[0]).toMatchObject({
      id,
      name: "图书馆东侧",
      isActive: true,
      photoCount: 0,
    });
  },
);
test.each(kinds)(
  "%s validates empty names, normalized duplicates, slug conflicts and field whitelist",
  async (kind) => {
    catalog.create(kind, { name: " Campus  Library ", slug: "library" });
    for (const value of [
      { name: " " },
      { name: "有效", role: "admin" },
      { name: "有效", sortOrder: -1 },
    ])
      expect(
        (await adminCatalogPost(kind)(request(kind, "POST", value))).status,
      ).toBe(422);
    for (const value of [
      { name: "campus library" },
      { name: "其他", slug: "library" },
    ])
      expect(
        (await adminCatalogPost(kind)(request(kind, "POST", value))).status,
      ).toBe(409);
    expect(
      (
        await adminCatalogPatch(kind)(
          request(kind, "PATCH", { isActive: false }),
          { params: Promise.resolve({ id: randomUUID() }) },
        )
      ).status,
    ).toBe(404);
    const forbidden = new Request(`http://localhost:3000/api/admin/${kind}`, {
      method: "POST",
      headers: {
        Origin: "https://evil.invalid",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "其他" }),
    });
    expect((await adminCatalogPost(kind)(forbidden)).status).toBe(403);
    const broken = new Request(`http://localhost:3000/api/admin/${kind}`, {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
      body: "{",
    });
    expect((await adminCatalogPost(kind)(broken)).status).toBe(422);
  },
);
test.each(kinds)(
  "public %s supports Chinese/English contains search, ordering and bounded whitelisted responses",
  async (kind) => {
    catalog.create(kind, { name: "图书馆", sortOrder: 2 });
    catalog.create(kind, { name: "图书馆东侧", sortOrder: 1 });
    catalog.create(kind, { name: "Campus Library", sortOrder: 0 });
    catalog.create(kind, { name: "图书馆西侧", isActive: false });
    authState.role = null;
    const get = (query: string) =>
      publicCatalogGet(kind)(
        new Request(`http://localhost:3000/api/${kind}?${query}`),
      );
    expect(
      (await (await get("q=图")).json()).data.items.map(
        (row: { name: string }) => row.name,
      ),
    ).toEqual(["图书馆东侧", "图书馆"]);
    const english = (await (await get("q=%20CAMPUS%20&limit=1")).json()).data
      .items;
    expect(english).toHaveLength(1);
    expect(Object.keys(english[0]).sort()).toEqual(["id", "name", "slug"]);
    expect((await get("q=" + "a".repeat(101))).status).toBe(422);
    expect((await get("limit=1000")).status).toBe(422);
    expect(
      (await (await get("q=%25%27%20OR%201%3D1")).json()).data.items,
    ).toEqual([]);
  },
);
function photo(values: Partial<typeof photos.$inferInsert> = {}) {
  const id = randomUUID();
  const sub = database.db
    .insert(submissions)
    .values({ authorName: "记录者", consentAccepted: true })
    .returning()
    .get();
  return database.db
    .insert(photos)
    .values({
      id,
      submissionId: sub.id,
      title: "旧照片",
      location: " 图书馆 ",
      originalKey: `originals/${id}/original.png`,
      mimeType: "image/png",
      byteSize: 10,
      ...values,
    })
    .returning()
    .get();
}
function moderation() {
  return new ModerationService({
    db: database.db,
    now: () => new Date(),
    imageService: {
      publishImageVersion: vi.fn(),
      confirmVersionPublication: vi.fn(),
      unpublishPublication: vi.fn(),
    },
    purge: vi.fn(),
  });
}
test("exact historical location mapping preserves text; rename/disable keep public display and filters", () => {
  const old = photo({
    status: "approved",
    ...publicationKeys(randomUUID(), randomUUID()),
    publishedAt: new Date(),
  });
  const similar = photo({ location: "图书馆东侧" });
  const location = catalog.create("locations", { name: "图书馆" });
  expect(
    database.db.select().from(photos).where(eq(photos.id, old.id)).get(),
  ).toMatchObject({ location: " 图书馆 ", locationId: location.id });
  expect(
    database.db.select().from(photos).where(eq(photos.id, similar.id)).get()
      ?.locationId,
  ).toBeNull();
  expect(catalog.list("locations").items[0].photoCount).toBe(1);
  catalog.update("locations", location.id, {
    name: "校园图书馆",
    isActive: false,
  });
  expect(getPublishedPhotoById(old.id)?.location).toBe("校园图书馆");
  expect(getPublishedPhotos({ location: "校园图书馆" }).total).toBe(1);
  expect(getPublishedPhotos({ location: "图书馆" }).total).toBe(0);
  expect(getArchiveFilters().locations).toEqual(["校园图书馆"]);
  expect(() => validateCatalogSelection(database.db, location.id, [])).toThrow(
    /地点已失效/,
  );
  expect(() =>
    catalog.update("locations", location.id, { slug: "changed" }),
  ).toThrow(/不能修改/);
});
test("moderation uses catalog IDs, retains disabled relations and unmapped legacy text, allows explicit clearing", () => {
  const old = photo({ location: "无法映射的历史地点" });
  const service = moderation();
  service.updateMetadata(old.id, "admin", { title: "仅改标题" });
  expect(service.getPhoto(old.id).location).toBe("无法映射的历史地点");
  service.updateMetadata(old.id, "admin", { title: "清除", locationId: null });
  expect(service.getPhoto(old.id).location).toBeNull();
  const location = catalog.create("locations", { name: "欣苑" });
  const tag = catalog.create("tags", { name: "建筑" });
  service.updateMetadata(old.id, "admin", {
    title: "选目录",
    locationId: location.id,
    tagIds: [tag.id],
  });
  catalog.update("locations", location.id, { isActive: false });
  catalog.update("tags", tag.id, { isActive: false });
  service.updateMetadata(old.id, "admin", {
    title: "保留历史",
    locationId: location.id,
    tagIds: [tag.id],
  });
  expect(service.getPhoto(old.id)).toMatchObject({
    location: "欣苑",
    tags: ["建筑"],
  });
  expect(
    service.listLogs(old.id).some((row) => row.metadataChanges.tagIds),
  ).toBe(true);
  const other = photo();
  expect(() =>
    service.updateMetadata(other.id, "admin", {
      title: "不合法",
      tagIds: [tag.id],
    }),
  ).toThrow(/标签已失效/);
  expect(() =>
    service.updateMetadata(other.id, "admin", {
      title: "不合法",
      tags: ["自由标签"],
    }),
  ).toThrow(/格式/);
});
function submissionInput(): CreateSubmissionInput {
  return {
    authorName: "记录者",
    consentAccepted: true,
    submissionRequestId: randomUUID(),
    turnstileToken: "mock",
    sourceKey: randomUUID(),
    files: [
      {
        file: new File(["test"], "same.png"),
        metadata: { title: "A", locationId: null, tagIds: [] },
      },
    ],
  };
}
function submissionService(
  onPreview?: () => void,
  cleanup = vi.fn(async () => {}),
) {
  const imageService: SubmissionDependencies["imageService"] = {
    saveOriginal: async (_bytes, photoId = randomUUID()) => ({
      photoId,
      key: `originals/${photoId}/original.png`,
      metadata: {
        format: "png",
        mimeType: "image/png",
        size: 4,
        width: 10,
        height: 10,
        orientation: 1,
      },
    }),
    generatePreview: async (photoId) => {
      onPreview?.();
      return {
        key: `previews/${photoId}/preview.webp`,
        width: 10,
        height: 10,
        format: "webp",
        size: 4,
        buffer: Buffer.from("mock"),
      };
    },
    cleanupPrivateFiles: cleanup,
    cleanupPrivatePhoto: vi.fn(async () => {}),
  };
  return new SubmissionService({
    db: database.db,
    now: () => new Date(),
    verifyTurnstile: async () => ({ success: true, errorCodes: [] }),
    imageService,
  });
}
test.each([
  "malformed",
  "missing-location",
  "disabled-location",
  "missing-tag",
  "disabled-tag",
  "duplicate-tags",
  "too-many-tags",
  "free-location",
  "free-tags",
])("submission rejects %s before saving private objects", async (scenario) => {
  const location = catalog.create("locations", {
    name: "操场",
    isActive: false,
  });
  const tag = catalog.create("tags", { name: "夜景", isActive: false });
  const metadata: Record<string, unknown> = { title: "A" };
  if (scenario === "malformed") metadata.locationId = "invalid-id";
  if (scenario === "missing-location") metadata.locationId = randomUUID();
  if (scenario === "disabled-location") metadata.locationId = location.id;
  if (scenario === "missing-tag") metadata.tagIds = [randomUUID()];
  if (scenario === "disabled-tag") metadata.tagIds = [tag.id];
  if (scenario === "duplicate-tags") metadata.tagIds = [tag.id, tag.id];
  if (scenario === "too-many-tags")
    metadata.tagIds = Array.from({ length: 21 }, () => randomUUID());
  if (scenario === "free-location") metadata.location = "自由地点";
  if (scenario === "free-tags") metadata.tags = ["自由标签"];
  const input = submissionInput();
  input.files[0].metadata = metadata;
  await expect(submissionService().create(input)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  expect(database.db.select().from(submissions).all()).toHaveLength(0);
  expect(database.db.select().from(submissionOperations).all()).toHaveLength(0);
});
test("three photos commit independent location/tag relations in order and remain private pending", async () => {
  const a = catalog.create("locations", { name: "图书馆" }),
    b = catalog.create("locations", { name: "勤学楼" });
  const labels = ["樱花", "建筑", "夜景"].map((name) =>
    catalog.create("tags", { name }),
  );
  const input = submissionInput();
  input.files = [
    { title: "A", locationId: a.id, tagIds: [labels[0].id, labels[1].id] },
    { title: "B", locationId: b.id, tagIds: [labels[2].id] },
    { title: "C", locationId: null, tagIds: [] },
  ].map((metadata) => ({ file: new File(["test"], "same.png"), metadata }));
  const result = await submissionService().create(input);
  const stored = database.db
    .select()
    .from(photos)
    .where(eq(photos.submissionId, result.submissionId))
    .all()
    .sort((one, two) => one.title.localeCompare(two.title));
  expect(stored.map((row) => row.locationId)).toEqual([a.id, b.id, null]);
  expect(
    stored.every(
      (row) => row.status === "pending" && !row.displayKey && !row.thumbnailKey,
    ),
  ).toBe(true);
  expect(
    stored.map((row) =>
      database.db
        .select()
        .from(photoTags)
        .where(eq(photoTags.photoId, row.id))
        .all()
        .map((link) => link.tagId)
        .sort(),
    ),
  ).toEqual([[labels[0].id, labels[1].id].sort(), [labels[2].id], []]);
  expect(getPublishedPhotos().total).toBe(0);
});
test("disable during upload rejects final transaction and cleans staged files", async () => {
  const tag = catalog.create("tags", { name: "夜景" });
  const input = submissionInput();
  input.files[0].metadata = { title: "A", tagIds: [tag.id] };
  const cleanup = vi.fn(async () => {});
  await expect(
    submissionService(() => {
      catalog.update("tags", tag.id, { isActive: false });
    }, cleanup).create(input),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(database.db.select().from(submissions).all()).toHaveLength(0);
  expect(database.db.select().from(photos).all()).toHaveLength(0);
  expect(database.db.select().from(photoTags).all()).toHaveLength(0);
  expect(database.db.select().from(submissionOperations).get()?.state).toBe(
    "failed",
  );
  expect(cleanup).toHaveBeenCalledTimes(1);
});
test("PhotoTags write failure rolls back the whole batch and compensates every private photo", async () => {
  const tag = catalog.create("tags", { name: "事务标签" });
  const input = submissionInput();
  input.files = ["A", "B"].map((title) => ({
    file: new File(["test"], "same.png"),
    metadata: { title, tagIds: [tag.id] },
  }));
  database.sqlite.exec(
    "CREATE TRIGGER fail_photo_tags BEFORE INSERT ON photo_tags BEGIN SELECT RAISE(ABORT, 'injected relation failure'); END;",
  );
  const cleanup = vi.fn(async () => {});
  await expect(
    submissionService(undefined, cleanup).create(input),
  ).rejects.toThrow();
  expect(database.db.select().from(submissions).all()).toEqual([]);
  expect(database.db.select().from(photos).all()).toEqual([]);
  expect(database.db.select().from(photoTags).all()).toEqual([]);
  expect(cleanup).toHaveBeenCalledTimes(2);
  expect(database.db.select().from(submissionOperations).get()?.state).toBe(
    "failed",
  );
});
test("disabled tags remain visible and filterable only for approved photos with complete resources", () => {
  const location = catalog.create("locations", { name: "操场" });
  const tag = catalog.create("tags", { name: "夜景" });
  const item = photo({
    locationId: location.id,
    status: "approved",
    ...publicationKeys(randomUUID(), randomUUID()),
    publishedAt: new Date(),
  });
  database.db
    .insert(photoTags)
    .values({ photoId: item.id, tagId: tag.id })
    .run();
  catalog.update("tags", tag.id, { name: "校园夜景", isActive: false });
  expect(getPublishedPhotoById(item.id)).toMatchObject({
    location: "操场",
    tags: ["校园夜景"],
    tagSlugs: [tag.slug],
  });
  expect(getPublishedPhotos({ tag: tag.slug, location: "操场" }).total).toBe(1);
  expect(getArchiveFilters().tags).toMatchObject([
    { name: "校园夜景", count: 1 },
  ]);
  database.db
    .update(photos)
    .set({ status: "hidden" })
    .where(eq(photos.id, item.id))
    .run();
  expect(getPublishedPhotos({ tag: tag.slug }).total).toBe(0);
  expect(getPublishedPhotoById(item.id)).toBeUndefined();
  expect(getArchiveFilters().tags).toEqual([]);
});
test("catalog migration preserves duplicate legacy tags, relations, photo text and all histories on repeated upgrade", () => {
  const oldFolder = join(directory, "old");
  mkdirSync(join(oldFolder, "meta"), { recursive: true });
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  );
  const entries = journal.entries.slice(0, 7) as { tag: string }[];
  writeFileSync(
    join(oldFolder, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  for (const entry of entries)
    copyFileSync(
      `drizzle/${entry.tag}.sql`,
      join(oldFolder, `${entry.tag}.sql`),
    );
  const legacy = openDatabase(join(directory, "legacy.sqlite"));
  try {
    migrate(legacy.db, { migrationsFolder: oldFolder });
    const subId = randomUUID(),
      photoId = randomUUID();
    legacy.sqlite
      .prepare("insert into submissions (id, submitted_at) values (?, ?)")
      .run(subId, 1);
    legacy.sqlite
      .prepare(
        "insert into photos (id, submission_id, title, location, original_key, mime_type, byte_size, submitted_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        photoId,
        subId,
        "历史",
        " 旧地点 ",
        "original",
        "image/png",
        1,
        1,
        1,
      );
    const tagIds = [
      "22222222-2222-4222-8222-222222222222",
      "11111111-1111-4111-8111-111111111111",
    ];
    for (const [index, name] of [" 夜景 ", "夜景"].entries()) {
      legacy.sqlite
        .prepare(
          "insert into tags (id, name, slug, created_at) values (?, ?, ?, ?)",
        )
        .run(tagIds[index], name, "legacy-" + index, 1);
      legacy.sqlite
        .prepare("insert into photo_tags (photo_id, tag_id) values (?, ?)")
        .run(photoId, tagIds[index]);
    }
    legacy.sqlite
      .prepare(
        "insert into moderation_logs (id, photo_id, admin_id, action, from_status, to_status, metadata_changes, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        randomUUID(),
        photoId,
        "legacy-admin",
        "edit",
        "pending",
        "pending",
        "{}",
        1,
      );
    migrate(legacy.db, { migrationsFolder: "drizzle" });
    migrate(legacy.db, { migrationsFolder: "drizzle" });
    expect(legacy.db.select().from(tags).all()).toHaveLength(2);
    expect(legacy.db.select().from(photoTags).all()).toHaveLength(2);
    expect(
      new CatalogService(legacy.db).search("tags", { q: "夜" }),
    ).toHaveLength(1);
    expect(legacy.db.select().from(photos).get()).toMatchObject({
      id: photoId,
      location: " 旧地点 ",
      locationId: null,
    });
    expect(
      legacy.sqlite
        .prepare("select count(*) as value from moderation_logs")
        .get(),
    ).toEqual({ value: 1 });
    expect(legacy.sqlite.pragma("foreign_key_check")).toEqual([]);
    const legacyCatalog = new CatalogService(legacy.db);
    // Restoring a legacy alias normalizes its display name without dropping either relation.
    legacyCatalog.update("tags", tagIds[1], { name: "校园夜景" });
    expect(
      legacyCatalog.update("tags", tagIds[0], { isActive: true }).name,
    ).toBe("夜景");
    expect(legacy.db.select().from(photoTags).all()).toHaveLength(2);
  } finally {
    legacy.sqlite.close();
  }
});
