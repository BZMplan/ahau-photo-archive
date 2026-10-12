import { beforeAll, afterAll, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../../src/server/db/connection";
import {
  photos,
  submissionOperations,
  submissions,
} from "../../src/server/db/schema";
import { LocalStorage } from "../../src/server/storage/local";
import { SqliteOperationJournal } from "../../src/server/storage/journal";
import { ImageService } from "../../src/server/services/image-service";
import {
  SubmissionRateLimitError,
  SubmissionService,
  type SubmissionDependencies,
} from "../../src/server/services/submissions";
import { StorageError } from "../../src/server/storage/errors";

let directory: string;
let database: ReturnType<typeof openDatabase>;
let imageService: ImageService;
let image: Buffer;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "ahau-submission-test-"));
  database = openDatabase(join(directory, "archive.sqlite"));
  migrate(database.db, { migrationsFolder: "drizzle" });
  image = await sharp({
    create: { width: 320, height: 240, channels: 3, background: "#456" },
  })
    .png()
    .toBuffer();
  imageService = new ImageService(
    {
      private: new LocalStorage(join(directory, "storage"), "private"),
      public: new LocalStorage(join(directory, "storage"), "public"),
    },
    new SqliteOperationJournal(database.db),
  );
});

afterAll(async () => {
  database.sqlite.close();
  await rm(directory, { recursive: true, force: true });
});

function deps(
  overrides: Partial<SubmissionDependencies> = {},
): SubmissionDependencies {
  return {
    db: database.db,
    imageService,
    verifyTurnstile: async () => ({ success: true, errorCodes: [] }),
    now: () => new Date("2026-01-02T03:04:05.000Z"),
    ...overrides,
  };
}

function input(count = 1, sourceKey = randomUUID()) {
  return {
    authorName: "Campus archivist",
    contactEmail: "archive@example.invalid",
    message: "A small record of campus life.",
    consentAccepted: true,
    submissionRequestId: randomUUID(),
    turnstileToken: "test-token",
    sourceKey,
    files: Array.from({ length: count }, (_, index) => ({
      file: new File([new Uint8Array(image)], `photo-${index}.png`, {
        type: "image/png",
      }),
      metadata: {
        title: `Campus view ${index + 1}`,
        description: "A generated test fixture.",
        takenAt: "2025-12-31",
        locationId: null,
        tagIds: [],
      },
    })),
  };
}

test("creates a multi-photo pending submission with private assets and aligned metadata", async () => {
  const result = await new SubmissionService(deps()).create(input(2));
  expect(result.status).toBe("pending");
  expect(result.photoCount).toBe(2);
  const stored = database.db
    .select()
    .from(photos)
    .all()
    .filter((photo) => photo.submissionId === result.submissionId);
  expect(stored.map((photo) => photo.title)).toEqual([
    "Campus view 1",
    "Campus view 2",
  ]);
  expect(stored.every((photo) => photo.status === "pending")).toBe(true);
  expect(
    stored.every(
      (photo) => photo.displayKey === null && photo.thumbnailKey === null,
    ),
  ).toBe(true);
  expect(
    stored.every((photo) => photo.previewKey?.startsWith("previews/")),
  ).toBe(true);
  expect(
    database.db
      .select()
      .from(submissions)
      .all()
      .find((row) => row.id === result.submissionId)?.consentAccepted,
  ).toBe(true);
  expect(
    database.db
      .select()
      .from(submissionOperations)
      .all()
      .some((row) => row.state === "complete"),
  ).toBe(true);
});

test("replays the same request id idempotently without another submission", async () => {
  const first = input(1);
  const service = new SubmissionService(deps());
  const one = await service.create(first);
  const two = await service.create(first);
  expect(two).toEqual(one);
  expect(
    database.db
      .select()
      .from(submissions)
      .all()
      .filter((row) => row.requestId === first.submissionRequestId),
  ).toHaveLength(1);
});

test("enforces three submissions per hour and fifteen photos per day", async () => {
  const sourceKey = randomUUID();
  const service = new SubmissionService(deps());
  await service.create(input(1, sourceKey));
  await service.create(input(1, sourceKey));
  await service.create(input(1, sourceKey));
  await expect(service.create(input(1, sourceKey))).rejects.toBeInstanceOf(
    SubmissionRateLimitError,
  );
});

test("Turnstile failure happens before storage and invalid input is rejected", async () => {
  const save = vi.spyOn(imageService, "saveOriginal");
  const service = new SubmissionService(
    deps({
      verifyTurnstile: async () => ({
        success: false,
        errorCodes: ["timeout-or-duplicate"],
      }),
    }),
  );
  await expect(service.create(input())).rejects.toThrow("安全验证未通过");
  expect(save).not.toHaveBeenCalled();
  await expect(
    service.create({ ...input(), consentAccepted: false }),
  ).rejects.toThrow("投稿信息格式不正确");
  save.mockRestore();
});

test("a later file failure cleans every earlier private object and records failure", async () => {
  const sourceKey = randomUUID();
  let count = 0;
  let firstSaved: Awaited<ReturnType<ImageService["saveOriginal"]>> | undefined;
  const failing = new ImageService(
    {
      private: new LocalStorage(join(directory, "failure-storage"), "private"),
      public: new LocalStorage(join(directory, "failure-storage"), "public"),
    },
    new SqliteOperationJournal(database.db),
  );
  const realSave = failing.saveOriginal.bind(failing);
  const save = vi
    .spyOn(failing, "saveOriginal")
    .mockImplementation(async (bytes) => {
      count++;
      if (count === 2) throw new StorageError("IO_ERROR");
      firstSaved = await realSave(bytes);
      return firstSaved;
    });
  const service = new SubmissionService(deps({ imageService: failing }));
  await expect(service.create(input(2, sourceKey))).rejects.toThrow();
  expect(firstSaved).toBeDefined();
  await expect(
    failing.getPrivateImage(firstSaved!.photoId, firstSaved!.key),
  ).rejects.toThrow();
  expect(
    database.db
      .select()
      .from(submissionOperations)
      .all()
      .some((row) => row.state === "failed"),
  ).toBe(true);
  save.mockRestore();
});

test("a database transaction failure compensates already-written private files", async () => {
  const transaction = vi
    .spyOn(database.db, "transaction")
    .mockImplementation(() => {
      throw new Error("simulated database failure");
    });
  const cleanup = vi.spyOn(imageService, "cleanupPrivateFiles");
  await expect(new SubmissionService(deps()).create(input())).rejects.toThrow(
    "simulated database failure",
  );
  expect(cleanup).toHaveBeenCalled();
  cleanup.mockRestore();
  transaction.mockRestore();
});
