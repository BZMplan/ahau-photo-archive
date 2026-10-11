import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../src/server/db/connection";
import { assertProductionTurnstileConfiguration } from "../src/server/security/turnstile-config";

test("container startup gate requires the committed migrations", () => {
  const directory = mkdtempSync(join(tmpdir(), "ahau-startup-"));
  const databasePath = join(directory, "archive.sqlite");
  const environment = { ...process.env, DATABASE_PATH: databasePath };
  try {
    const missing = spawnSync(
      process.execPath,
      ["scripts/check-migrations.mjs"],
      { env: environment, encoding: "utf8" },
    );
    assert.notEqual(missing.status, 0);
    const { db, sqlite } = openDatabase(databasePath);
    try {
      migrate(db, { migrationsFolder: "drizzle" });
    } finally {
      sqlite.close();
    }
    const ready = spawnSync(
      process.execPath,
      ["scripts/check-migrations.mjs"],
      {
        env: environment,
        encoding: "utf8",
      },
    );
    assert.equal(ready.status, 0, ready.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("production Turnstile configuration rejects missing and official test keys", () => {
  const valid = {
    NODE_ENV: "production",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "real-site-key-placeholder",
    TURNSTILE_SECRET_KEY: "real-secret-key-placeholder",
  };
  assert.doesNotThrow(() => assertProductionTurnstileConfiguration(valid));
  assert.throws(
    () =>
      assertProductionTurnstileConfiguration({
        ...valid,
        TURNSTILE_SECRET_KEY: "",
      }),
    /required/,
  );
  assert.throws(
    () =>
      assertProductionTurnstileConfiguration({
        ...valid,
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      }),
    /test keys/,
  );
  assert.throws(
    () =>
      assertProductionTurnstileConfiguration({
        ...valid,
        TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      }),
    /test keys/,
  );
});

test("online backup captures WAL data and restore requires explicit confirmation", () => {
  const directory = mkdtempSync(join(tmpdir(), "ahau-deployment-"));
  const databasePath = join(directory, "archive.sqlite");
  const backupDirectory = join(directory, "backups");
  const environment = {
    ...process.env,
    DATABASE_PATH: databasePath,
    BACKUP_DIR: backupDirectory,
  };
  try {
    const database = new Database(databasePath);
    database.pragma("journal_mode = WAL");
    database.exec("CREATE TABLE photos (id TEXT PRIMARY KEY)");
    database.prepare("INSERT INTO photos VALUES (?)").run("before");

    const backup = spawnSync(process.execPath, ["scripts/backup-db.mjs"], {
      env: environment,
      encoding: "utf8",
    });
    assert.equal(backup.status, 0, backup.stderr);
    const name = readdirSync(backupDirectory).find((file) =>
      /^archive-.*\.sqlite$/.test(file),
    );
    assert.ok(name);
    assert.equal(existsSync(join(backupDirectory, `${name}-wal`)), false);
    assert.equal(existsSync(join(backupDirectory, `${name}-shm`)), false);

    database.prepare("INSERT INTO photos VALUES (?)").run("after");
    const refused = spawnSync(
      process.execPath,
      ["scripts/restore-db.mjs", name],
      { env: environment, encoding: "utf8" },
    );
    assert.notEqual(refused.status, 0);
    const count = database
      .prepare("SELECT count(*) AS n FROM photos")
      .get() as {
      n: number;
    };
    assert.equal(count.n, 2);
    database.close();

    const restored = spawnSync(
      process.execPath,
      ["scripts/restore-db.mjs", name],
      {
        env: { ...environment, RESTORE_CONFIRM: "YES" },
        encoding: "utf8",
      },
    );
    assert.equal(restored.status, 0, restored.stderr);
    const current = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      assert.deepEqual(current.prepare("SELECT id FROM photos").all(), [
        { id: "before" },
      ]);
    } finally {
      current.close();
    }
    assert.ok(
      readdirSync(backupDirectory).some((file) =>
        file.startsWith("archive-before-restore-"),
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
