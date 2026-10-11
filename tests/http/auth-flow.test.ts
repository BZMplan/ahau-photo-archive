import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../../src/server/db/connection";
import {
  photos,
  submissions,
  tags,
  photoTags,
} from "../../src/server/db/schema";
import { session } from "../../src/server/db/auth-schema";
import { createArchiveAuth } from "../../src/server/auth/options";

const directory = mkdtempSync(join(tmpdir(), "ahau-http-test-"));
const databasePath = join(directory, "archive.sqlite");
const { db, sqlite } = openDatabase(databasePath);
const password = randomBytes(32).toString("base64url");
const secret = randomBytes(48).toString("base64url");
const development = process.env.AHAU_TEST_SERVER_MODE === "development";
let origin: string;
let server: ChildProcess | undefined;
let adminId: string;
let output = "";

before(
  async () => {
    if (!development)
      assert.ok(
        existsSync(".next/standalone/server.js"),
        "Run pnpm build before pnpm test:auth-flow.",
      );
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const address = probe.address();
    assert.ok(address && typeof address === "object");
    const port = address.port;
    await new Promise<void>((resolve, reject) =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
    origin = `http://127.0.0.1:${port}`;
    migrate(db, { migrationsFolder: "drizzle" });
    const auth = createArchiveAuth(db, {
      baseURL: origin,
      secret,
      secureCookies: false,
    });
    adminId = (
      await auth.api.createUser({
        body: {
          name: "HTTP test administrator",
          email: "admin@example.invalid",
          password,
          role: "admin",
        },
      })
    ).user.id;
    await auth.api.createUser({
      body: {
        name: "HTTP test visitor",
        email: "visitor@example.invalid",
        password,
        role: "user",
      },
    });
    server = spawn(
      process.execPath,
      development
        ? [
            "node_modules/next/dist/bin/next",
            "dev",
            "--hostname",
            "127.0.0.1",
            "--port",
            String(port),
          ]
        : ["scripts/start.mjs"],
      {
        env: {
          ...process.env,
          NODE_ENV: development ? "development" : "production",
          HOSTNAME: "127.0.0.1",
          PORT: String(port),
          DATABASE_PATH: databasePath,
          STORAGE_DRIVER: "local",
          BETTER_AUTH_URL: origin,
          BETTER_AUTH_SECRET: secret,
          NEXT_PUBLIC_TURNSTILE_SITE_KEY: "stage7-test-site-key",
          TURNSTILE_SECRET_KEY: "stage7-test-secret-key",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout?.on("data", (chunk) => {
      output = (output + String(chunk)).slice(-8000);
    });
    server.stderr?.on("data", (chunk) => {
      output = (output + String(chunk)).slice(-8000);
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try {
        if ((await fetch(`${origin}/api/health`)).ok) return;
      } catch {
        /* Startup is asynchronous. */
      }
      await delay(100);
    }
    throw new Error(`Server did not start: ${output}`);
  },
  { timeout: 30_000 },
);

after(async () => {
  if (server && server.exitCode === null) {
    const closed = new Promise<void>((resolve) =>
      server?.once("exit", () => resolve()),
    );
    server.kill("SIGTERM");
    await Promise.race([closed, delay(3000)]);
    if (server.exitCode === null) {
      server.kill("SIGKILL");
      await closed;
    }
  }
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});
function get(path: string, cookie?: string) {
  return fetch(`${origin}${path}`, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : {},
  });
}
function post(path: string, body: Record<string, unknown>, cookie?: string) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
async function signIn(email = "admin@example.invalid") {
  const result = await post("/api/auth/sign-in/email", { email, password });
  assert.equal(result.status, 200);
  return result.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
async function assertLoginRedirect(path: string, cookie?: string) {
  const result = await get(path, cookie);
  assert.equal(result.status, 307);
  assert.ok(result.headers.get("location")?.startsWith("/admin/login"));
  assert.doesNotMatch(await result.text(), /HTTP test administrator/);
}

test("public pages and real login form load without a session", async () => {
  for (const path of ["/", "/submit", "/admin/login"])
    assert.equal((await get(path)).status, 200);
  const html = await (await get("/admin/login")).text();
  assert.match(html, /autoComplete="current-password"/i);
  assert.match(html, /type="submit"/);
  assert.doesNotMatch(html, /name="password"[^>]*disabled/);
});

test("all protected pages redirect anonymous requests and API returns 401", async () => {
  for (const path of ["/admin", "/admin/reviews", "/admin/photos"])
    await assertLoginRedirect(path);
  assert.equal((await get("/api/admin/me")).status, 401);
});

test("failed login returns 401; admin login survives refreshed pages and redirects login", async () => {
  assert.equal(
    (
      await post("/api/auth/sign-in/email", {
        email: "admin@example.invalid",
        password: randomBytes(32).toString("hex"),
      })
    ).status,
    401,
  );
  const cookie = await signIn();
  for (const path of ["/admin", "/admin/reviews", "/admin/photos", "/admin"]) {
    const result = await get(path, cookie);
    assert.equal(result.status, 200);
    assert.match(await result.text(), /HTTP test administrator/);
  }
  const login = await get("/admin/login", cookie);
  assert.equal(login.status, 307);
  assert.equal(login.headers.get("location"), "/admin");
  const me = await get("/api/admin/me", cookie);
  assert.equal(me.status, 200);
  assert.deepEqual(await me.json(), {
    data: {
      user: {
        id: adminId,
        name: "HTTP test administrator",
        email: "admin@example.invalid",
        role: "admin",
      },
    },
  });
  assert.equal((await post("/api/auth/sign-out", {}, cookie)).status, 200);
  await assertLoginRedirect("/admin", cookie);
  assert.equal((await get("/api/admin/me", cookie)).status, 401);
});

test("non-admin pages are refused and API returns 403", async () => {
  const cookie = await signIn("visitor@example.invalid");
  for (const path of ["/admin", "/admin/reviews", "/admin/photos"])
    await assertLoginRedirect(path, cookie);
  assert.equal((await get("/api/admin/me", cookie)).status, 403);
  assert.match(
    await (await get("/admin/login", cookie)).text(),
    /当前账号没有管理员权限/,
  );
  await post("/api/auth/sign-out", {}, cookie);
});

test("expired session refuses pages and API", async () => {
  const cookie = await signIn();
  db.update(session)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(session.userId, adminId))
    .run();
  await assertLoginRedirect("/admin", cookie);
  assert.equal((await get("/api/admin/me", cookie)).status, 401);
});

test(
  "production startup fails fast without the mandatory secret",
  { skip: development },
  () => {
    const result = spawnSync(process.execPath, ["scripts/start.mjs"], {
      env: {
        ...process.env,
        PORT: "0",
        HOSTNAME: "127.0.0.1",
        DATABASE_PATH: databasePath,
        BETTER_AUTH_URL: origin,
        BETTER_AUTH_SECRET: "",
      },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /BETTER_AUTH_SECRET/);
  },
);

test("private preview and approved public derivatives are served by the real HTTP routes", async () => {
  const id = randomUUID();
  const originalKey = `originals/${id}/original.png`,
    previewKey = `previews/${id}/preview.webp`;
  const displayKey = `photos/${id}/display.webp`,
    thumbnailKey = `photos/${id}/thumbnail.webp`;
  const original = await sharp({
    create: { width: 160, height: 100, channels: 3, background: "#34664a" },
  })
    .png()
    .toBuffer();
  const derivative = await sharp(original).webp().toBuffer();
  for (const [scope, key, bytes] of [
    ["private", originalKey, original],
    ["private", previewKey, derivative],
    ["public", displayKey, derivative],
    ["public", thumbnailKey, derivative],
  ] as const) {
    const target = join(directory, "storage", scope, key);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, bytes);
  }
  const batch = db
    .insert(submissions)
    .values({ attribution: "Generated HTTP fixture" })
    .returning()
    .get();
  db.insert(photos)
    .values({
      id,
      submissionId: batch.id,
      title: "Generated HTTP image",
      originalKey,
      previewKey,
      displayKey,
      thumbnailKey,
      mimeType: "image/png",
      byteSize: original.length,
    })
    .run();
  const previewURL = `/api/admin/photos/${id}/preview`;
  assert.equal((await get(previewURL)).status, 401);
  const visitor = await signIn("visitor@example.invalid");
  assert.equal((await get(previewURL, visitor)).status, 403);
  const admin = await signIn();
  const result = await get(`${previewURL}?key=${originalKey}`, admin);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("content-type"), "image/webp");
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), derivative);
  assert.equal(
    (await get(`/api/admin/photos/${randomUUID()}/preview`, admin)).status,
    404,
  );
  for (const path of [
    `/api/images/${displayKey}`,
    `/api/images/${originalKey}`,
    `/api/images/${previewKey}`,
    `/data/storage/private/${originalKey}`,
    `/api/images/photos/%2e%2e%2fprivate/secret.webp`,
  ])
    assert.equal((await get(path)).status, 404);
  db.update(photos)
    .set({ status: "approved", publishedAt: new Date() })
    .where(eq(photos.id, id))
    .run();
  const visible = await get(`/api/images/${displayKey}`);
  assert.equal(visible.status, 200);
  assert.deepEqual(Buffer.from(await visible.arrayBuffer()), derivative);
  db.update(photos).set({ status: "hidden" }).where(eq(photos.id, id)).run();
  assert.equal((await get(`/api/images/${displayKey}`)).status, 404);
  await post("/api/auth/sign-out", {}, admin);
  await post("/api/auth/sign-out", {}, visitor);
});

test("real HTTP moderation flow publishes, hides and restores a local photo", async () => {
  const id = randomUUID();
  const originalKey = `originals/${id}/original.png`;
  const previewKey = `previews/${id}/preview.webp`;
  const original = await sharp({
    create: { width: 240, height: 160, channels: 3, background: "#784" },
  })
    .png()
    .toBuffer();
  const preview = await sharp(original).resize(120).webp().toBuffer();
  for (const [scope, key, bytes] of [
    ["private", originalKey, original],
    ["private", previewKey, preview],
  ] as const) {
    const target = join(directory, "storage", scope, key);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, bytes);
  }
  const batch = db
    .insert(submissions)
    .values({
      attribution: "HTTP moderation fixture",
      authorName: "HTTP moderation fixture",
      consentAccepted: true,
    })
    .returning()
    .get();
  db.insert(photos)
    .values({
      id,
      submissionId: batch.id,
      title: "待审核 HTTP 照片",
      takenAt: "2025-10-01",
      location: "图书馆",
      originalKey,
      previewKey,
      mimeType: "image/png",
      byteSize: original.length,
      width: 240,
      height: 160,
    })
    .run();
  const admin = await signIn();
  const pending = await get("/api/admin/reviews?status=pending", admin);
  assert.equal(pending.status, 200);
  assert.ok(
    (await pending.json()).data.items.some(
      (item: { id: string }) => item.id === id,
    ),
  );
  assert.equal((await get(`/photo/${id}`)).status, 404);
  const label = db
    .insert(tags)
    .values({ name: "HTTP 标签", slug: "http-gallery" })
    .returning()
    .get();
  db.insert(photoTags).values({ photoId: id, tagId: label.id }).run();
  const approve = await post(`/api/admin/reviews/${id}/approve`, {}, admin);
  assert.equal(approve.status, 200);
  const approved = db.select().from(photos).where(eq(photos.id, id)).get();
  assert.equal(approved?.status, "approved");
  assert.match(approved?.displayKey ?? "", new RegExp(`photos/${id}/`));
  assert.equal(
    (await get(`/api/images/${approved!.displayKey}`, admin)).status,
    200,
  );
  assert.equal((await get(`/api/admin/photos/${id}/logs`, admin)).status, 200);
  for (const path of [
    "/",
    "/archive?year=2025&season=autumn&tag=http-gallery",
    "/tags/http-gallery",
    `/photo/${id}`,
  ]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(
      response.headers.get("cache-control") || "",
      /no-store|private/,
    );
    const html = await response.text();
    assert.ok(html.includes(id), path);
    assert.ok(!html.includes(originalKey));
    assert.ok(!html.includes(previewKey));
    if (path.startsWith("/photo/")) assert.ok(html.includes("og:image"));
  }
  assert.equal((await get("/tags/does-not-exist")).status, 404);
  assert.equal((await get(`/photo/${randomUUID()}`)).status, 404);
  assert.ok((await (await get("/sitemap.xml")).text()).includes(id));
  const edited = await fetch(`${origin}/api/admin/photos/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: admin,
    },
    body: JSON.stringify({
      title: "更新后的公开标题",
      description: "公开说明",
      location: "图书馆",
      takenAt: "2025-10-01",
      tags: ["HTTP 标签"],
    }),
  });
  assert.equal(edited.status, 200);
  const updatedHtml = await (await get(`/photo/${id}`)).text();
  assert.ok(updatedHtml.includes("更新后的公开标题"));
  assert.ok(updatedHtml.includes("2025-10-01"));
  // A broken public object must produce 404 rather than falling back to the original.
  const missingId = randomUUID();
  db.insert(photos)
    .values({
      id: missingId,
      submissionId: batch.id,
      title: "缺失公开对象",
      status: "approved",
      originalKey: `originals/${missingId}/original.png`,
      displayKey: `photos/${missingId}/display.webp`,
      thumbnailKey: `photos/${missingId}/thumbnail.webp`,
      publishedAt: new Date(),
      mimeType: "image/png",
      byteSize: 100,
    })
    .run();
  assert.equal(
    (await get(`/api/images/photos/${missingId}/display.webp`)).status,
    404,
  );
  db.delete(photos).where(eq(photos.id, missingId)).run();
  const hidden = await post(`/api/admin/photos/${id}/hide`, {}, admin);
  assert.equal(hidden.status, 200);
  assert.equal(
    db.select().from(photos).where(eq(photos.id, id)).get()?.status,
    "hidden",
  );
  assert.equal((await get(`/photo/${id}`)).status, 404);
  assert.equal((await get(`/api/images/${approved!.displayKey}`)).status, 404);
  for (const path of ["/", "/archive", "/tags/http-gallery", "/sitemap.xml"]) {
    assert.ok(!(await (await get(path)).text()).includes(id), path);
  }
  const restored = await post(`/api/admin/photos/${id}/restore`, {}, admin);
  assert.equal(restored.status, 200);
  const restoredPhoto = db.select().from(photos).where(eq(photos.id, id)).get();
  assert.equal(restoredPhoto?.status, "approved");
  assert.notEqual(restoredPhoto?.publicationId, approved?.publicationId);
  assert.equal((await get(`/photo/${id}`)).status, 200);
  assert.equal((await get(`/api/images/${approved!.displayKey}`)).status, 404);
  assert.equal(
    (await get(`/api/images/${restoredPhoto!.displayKey}`)).status,
    200,
  );
  await post("/api/auth/sign-out", {}, admin);
});

test(
  "R2 mode fails startup without credentials instead of falling back to local",
  { skip: development },
  () => {
    const result = spawnSync(process.execPath, ["scripts/start.mjs"], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: "0",
        HOSTNAME: "127.0.0.1",
        DATABASE_PATH: databasePath,
        BETTER_AUTH_URL: origin,
        BETTER_AUTH_SECRET: secret,
        STORAGE_DRIVER: "r2",
        R2_ACCOUNT_ID: "",
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "stage7-test-site-key",
        TURNSTILE_SECRET_KEY: "stage7-test-secret-key",
      },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /R2_ACCOUNT_ID/);
  },
);
