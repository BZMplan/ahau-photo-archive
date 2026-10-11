import { beforeAll, afterAll, expect, test, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "../../src/server/db";
import { photos, submissions } from "../../src/server/db/schema";
import { getStorage } from "../../src/server/storage";
import { POST } from "../../src/app/api/submissions/route";

let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "ahau-submission-route-test-"));
  vi.stubEnv("DATABASE_PATH", join(directory, "archive.sqlite"));
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("LOCAL_STORAGE_PATH", join(directory, "storage"));
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(48).toString("base64url"));
  vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        success: true,
        hostname: "localhost",
        action: "submit",
        "error-codes": [],
      }),
    ),
  );
  migrate(getDb(), { migrationsFolder: "drizzle" });
});

afterAll(async () => {
  getDb().$client.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

async function body() {
  const bytes = await sharp({
    create: { width: 120, height: 80, channels: 3, background: "#456" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append(
    "files",
    new File([new Uint8Array(bytes)], "campus.png", { type: "image/png" }),
  );
  form.set(
    "metadata",
    JSON.stringify([{ title: "Route fixture", location: "Library" }]),
  );
  form.set("authorName", "Anonymous archivist");
  form.set("contactEmail", "archive@example.invalid");
  form.set("message", "Route integration fixture");
  form.set("consentAccepted", "true");
  form.set("turnstileToken", "turnstile-token");
  form.set("submissionRequestId", randomUUID());
  return form;
}

test("POST /api/submissions creates pending private photos and safe DTO", async () => {
  const response = await POST(
    new Request("http://localhost:3000/api/submissions", {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
      body: await body(),
    }),
  );
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(result.success).toBe(true);
  expect(result.data.status).toBe("pending");
  expect(result.data.photoCount).toBe(1);
  expect(result.data).not.toHaveProperty("originalKey");
  expect(result.data).not.toHaveProperty("contactEmail");
  const stored = getDb()
    .select()
    .from(photos)
    .all()
    .find((photo) => photo.id === result.data.submissionId);
  expect(stored).toBeUndefined();
  const batch = getDb()
    .select()
    .from(submissions)
    .all()
    .find((item) => item.id === result.data.submissionId);
  expect(batch?.consentAccepted).toBe(true);
  const photosForBatch = getDb()
    .select()
    .from(photos)
    .all()
    .filter((photo) => photo.submissionId === batch?.id);
  expect(photosForBatch).toHaveLength(1);
  expect(photosForBatch[0].status).toBe("pending");
  expect(photosForBatch[0].displayKey).toBeNull();
  expect(
    await getStorage().public.exists(
      `photos/${photosForBatch[0].id}/display.webp`,
    ),
  ).toBe(false);
  expect(await getStorage().private.exists(photosForBatch[0].originalKey)).toBe(
    true,
  );
});

test("origin and Turnstile failures are rejected before a submission", async () => {
  const originResponse = await POST(
    new Request("http://localhost:3000/api/submissions", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
      body: await body(),
    }),
  );
  expect(originResponse.status).toBe(403);
  const form = await body();
  form.set("turnstileToken", "");
  const missingToken = await POST(
    new Request("http://localhost:3000/api/submissions", {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
      body: form,
    }),
  );
  expect(missingToken.status).toBe(422);
});
