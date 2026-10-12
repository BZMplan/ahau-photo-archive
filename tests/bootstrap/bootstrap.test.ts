import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  AbortMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { runBootstrap } from "@/server/bootstrap";
import { openDatabase } from "@/server/db/connection";

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "ahau-bootstrap-test-"));
  vi.stubEnv("DATABASE_PATH", join(directory, "archive.db"));
  vi.stubEnv("BACKUP_DIR", join(directory, "backups"));
  vi.stubEnv("LOCAL_STORAGE_PATH", join(directory, "storage"));
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_SECRET", "");
  vi.stubEnv("ADMIN_BOOTSTRAP_EMAIL", "");
  vi.stubEnv("ADMIN_BOOTSTRAP_PASSWORD", "");
  vi.stubEnv("ADMIN_BOOTSTRAP_NAME", "");
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

test("local bootstrap never contacts R2", async () => {
  const send = vi.spyOn(S3Client.prototype, "send");
  await runBootstrap();
  expect(send).not.toHaveBeenCalled();
});

test("R2 bootstrap checks both buckets and writes no public object", async () => {
  vi.stubEnv("STORAGE_DRIVER", "r2");
  vi.stubEnv("R2_ACCOUNT_ID", "a".repeat(32));
  vi.stubEnv("R2_ACCESS_KEY_ID", "test-access");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-secret");
  vi.stubEnv("R2_PRIVATE_BUCKET", "archive-private");
  vi.stubEnv("R2_PUBLIC_BUCKET", "archive-public");
  vi.stubEnv("R2_PUBLIC_BASE_URL", "https://images.example.org");
  vi.stubEnv("R2_AUTO_CREATE_BUCKETS", "true");
  const operations: string[] = [];
  let missing = true;
  vi.spyOn(S3Client.prototype, "send").mockImplementation(
    async (command: unknown) => {
      operations.push(command?.constructor.name || "unknown");
      if (command instanceof HeadBucketCommand && missing) {
        missing = false;
        throw { $metadata: { httpStatusCode: 404 } };
      }
      if (command instanceof CreateMultipartUploadCommand)
        return { UploadId: "probe-id" } as never;
      return {} as never;
    },
  );
  await runBootstrap();
  expect(
    operations.filter((value) => value === CreateBucketCommand.name),
  ).toHaveLength(1);
  expect(
    operations.filter((value) => value === ListObjectsV2Command.name),
  ).toHaveLength(2);
  expect(
    operations.filter((value) => value === AbortMultipartUploadCommand.name),
  ).toHaveLength(2);
  expect(operations).not.toContain("PutObjectCommand");
});

function withDb<T>(fn: (db: Database.Database) => T): T {
  const database = new Database(join(directory, "archive.db"), {
    fileMustExist: true,
  });
  try {
    return fn(database);
  } finally {
    database.close();
  }
}

test("first bootstrap creates schema, local storage, stable secret and one admin", async () => {
  await runBootstrap();
  const files = [
    "better-auth-secret",
    "auth-secret-state.json",
    "admin-credentials",
  ];
  for (const file of files) {
    const path = join(directory, "bootstrap", file);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).mode & 0o077).toBe(0);
  }
  for (const scope of ["private", "public"])
    expect(statSync(join(directory, "storage", scope)).isDirectory()).toBe(
      true,
    );
  const credentials = JSON.parse(
    readFileSync(join(directory, "bootstrap/admin-credentials"), "utf8"),
  );
  expect(credentials.email).toBe("admin@localhost.invalid");
  expect(credentials.password.length).toBeGreaterThanOrEqual(32);
  expect(
    withDb(
      (db) =>
        db
          .prepare("SELECT count(*) AS count FROM __drizzle_migrations")
          .get() as { count: number },
    ).count,
  ).toBeGreaterThan(0);
  expect(withDb((db) => db.prepare("SELECT role FROM user").get())).toEqual({
    role: "admin",
  });
  expect(
    withDb((db) =>
      db
        .prepare(
          "SELECT password_change_required AS required FROM bootstrap_state",
        )
        .get(),
    ),
  ).toEqual({ required: 1 });
});

test("repeated bootstrap preserves the administrator, password, photos and stored objects", async () => {
  await runBootstrap();
  const original = readFileSync(
    join(directory, "bootstrap/admin-credentials"),
    "utf8",
  );
  const originalSecret = readFileSync(
    join(directory, "bootstrap/better-auth-secret"),
    "utf8",
  );
  const adminId = withDb(
    (db) =>
      (
        db.prepare("SELECT id FROM user WHERE role='admin'").get() as {
          id: string;
        }
      ).id,
  );
  const originalPath = join(directory, "storage/private/example.jpg");
  writeFileSync(originalPath, "original bytes");
  withDb((db) => {
    db.prepare(
      "INSERT INTO submissions (id, submitted_at) VALUES ('s1', ?)",
    ).run(Date.now());
    db.prepare(
      "INSERT INTO photos (id, submission_id, title, original_key, mime_type, byte_size, submitted_at, updated_at) VALUES ('p1','s1','Photo','private/example.jpg','image/jpeg',14,?,?)",
    ).run(Date.now(), Date.now());
  });
  vi.stubEnv("ADMIN_BOOTSTRAP_EMAIL", "changed@example.org");
  vi.stubEnv("ADMIN_BOOTSTRAP_PASSWORD", randomBytes(20).toString("base64url"));
  await runBootstrap();
  expect(
    readFileSync(join(directory, "bootstrap/admin-credentials"), "utf8"),
  ).toBe(original);
  expect(
    readFileSync(join(directory, "bootstrap/better-auth-secret"), "utf8"),
  ).toBe(originalSecret);
  expect(readFileSync(originalPath, "utf8")).toBe("original bytes");
  expect(
    withDb((db) => db.prepare("SELECT count(*) AS count FROM photos").get()),
  ).toEqual({ count: 1 });
  expect(
    withDb((db) => db.prepare("SELECT id FROM user WHERE role='admin'").get()),
  ).toEqual({ id: adminId });
  expect(existsSync(join(directory, "backups"))).toBe(false);
});

test("configured admin and secret are used only once", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(48).toString("base64url"));
  vi.stubEnv("ADMIN_BOOTSTRAP_EMAIL", "first@example.org");
  vi.stubEnv("ADMIN_BOOTSTRAP_PASSWORD", "ConfiguredPass123456789");
  await runBootstrap();
  expect(existsSync(join(directory, "bootstrap/admin-credentials"))).toBe(
    false,
  );
  expect(
    withDb((db) =>
      db.prepare("SELECT email FROM user WHERE role='admin'").get(),
    ),
  ).toEqual({ email: "first@example.org" });
  vi.stubEnv("ADMIN_BOOTSTRAP_EMAIL", "second@example.org");
  vi.stubEnv("ADMIN_BOOTSTRAP_PASSWORD", "OtherPassword123456789");
  await runBootstrap();
  expect(
    withDb((db) =>
      db.prepare("SELECT email FROM user WHERE role='admin'").get(),
    ),
  ).toEqual({ email: "first@example.org" });
  vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(48).toString("base64url"));
  await expect(runBootstrap()).rejects.toThrow(/轮换/);
});

test("existing database without its secret and missing admin after provisioning fail closed", async () => {
  const secret = randomBytes(48).toString("base64url");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  await runBootstrap();
  vi.stubEnv("BETTER_AUTH_SECRET", "");
  await expect(runBootstrap()).rejects.toThrow(/BETTER_AUTH_SECRET/);
  const originalSecret = readFileSync(
    join(directory, "bootstrap/auth-secret-state.json"),
    "utf8",
  );
  expect(originalSecret).toContain("fingerprint");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  withDb((db) => db.prepare("DELETE FROM user WHERE role='admin'").run());
  await expect(runBootstrap()).rejects.toThrow(/恢复流程/);
});

function prepareOldDatabase() {
  const folder = join(directory, "old-drizzle");
  mkdirSync(join(folder, "meta"), { recursive: true });
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  );
  // Keep the fixture before 0006 even when later migrations are appended.
  journal.entries = journal.entries.slice(0, 6);
  writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries)
    writeFileSync(
      join(folder, `${entry.tag}.sql`),
      readFileSync(join("drizzle", `${entry.tag}.sql`)),
    );
  const opened = openDatabase(join(directory, "archive.db"));
  try {
    migrate(opened.db, { migrationsFolder: folder });
    opened.sqlite
      .prepare(
        "INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role) VALUES ('legacy','Legacy','legacy@example.org',0,?,?, 'user')",
      )
      .run(Date.now(), Date.now());
  } finally {
    opened.sqlite.close();
  }
}

test("existing schema upgrades only after an online backup and keeps old users", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(48).toString("base64url"));
  prepareOldDatabase();
  await runBootstrap();
  expect(readdirSync(join(directory, "backups"))).toHaveLength(1);
  expect(
    withDb((db) =>
      db.prepare("SELECT email FROM user WHERE id='legacy'").get(),
    ),
  ).toEqual({ email: "legacy@example.org" });
  expect(
    withDb((db) =>
      db
        .prepare("SELECT 1 FROM sqlite_master WHERE name='bootstrap_state'")
        .get(),
    ),
  ).toBeTruthy();
  expect(
    withDb((db) =>
      db.prepare("SELECT 1 FROM sqlite_master WHERE name='locations'").get(),
    ),
  ).toBeTruthy();
});

test("failed upgrade backup leaves the old schema untouched", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(48).toString("base64url"));
  prepareOldDatabase();
  writeFileSync(join(directory, "backups"), "occupied");
  await expect(runBootstrap()).rejects.toThrow();
  expect(
    withDb((db) =>
      db
        .prepare("SELECT 1 FROM sqlite_master WHERE name='bootstrap_state'")
        .get(),
    ),
  ).toBeUndefined();
  expect(
    withDb((db) =>
      db.prepare("SELECT 1 FROM sqlite_master WHERE name='locations'").get(),
    ),
  ).toBeUndefined();
});

test("occupied local storage path prevents initialization without deleting it", async () => {
  const path = join(directory, "storage");
  writeFileSync(path, "keep");
  await expect(runBootstrap()).rejects.toThrow();
  expect(readFileSync(path, "utf8")).toBe("keep");
  expect(
    withDb((db) => db.prepare("SELECT count(*) AS count FROM user").get()),
  ).toEqual({ count: 0 });
});

test("corrupt existing database prevents startup", async () => {
  writeFileSync(join(directory, "archive.db"), "not a database");
  vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(48).toString("base64url"));
  await expect(runBootstrap()).rejects.toThrow();
});
