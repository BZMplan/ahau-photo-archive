import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../src/server/db/connection";
import { moderationLogs, submissions } from "../src/server/db/schema";
import { user } from "../src/server/db/auth-schema";

test("additive authentication migration preserves existing business records and review history", () => {
  const directory = mkdtempSync(join(tmpdir(), "ahau-migration-test-"));
  const oldFolder = join(directory, "old-migrations");
  mkdirSync(join(oldFolder, "meta"), { recursive: true });
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  );
  writeFileSync(
    join(oldFolder, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }),
  );
  copyFileSync(
    `drizzle/${journal.entries[0].tag}.sql`,
    join(oldFolder, `${journal.entries[0].tag}.sql`),
  );
  const { db, sqlite } = openDatabase(join(directory, "archive.sqlite"));
  try {
    migrate(db, { migrationsFolder: oldFolder });
    const batch = db
      .insert(submissions)
      .values({
        attribution: "Existing author",
        contact: "private@example.invalid",
      })
      .returning()
      .get();
    // Use the historical column list: today's Drizzle insert includes preview_key.
    const photo = { id: randomUUID() };
    sqlite
      .prepare(
        "INSERT INTO photos (id, submission_id, title, original_key, mime_type, byte_size, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        photo.id,
        batch.id,
        "Existing photograph",
        `private/${randomUUID()}`,
        "image/jpeg",
        100,
        Date.now(),
        Date.now(),
      );
    const beforePhoto = sqlite
      .prepare("SELECT * FROM photos WHERE id = ?")
      .get(photo.id);
    const log = db
      .insert(moderationLogs)
      .values({
        photoId: photo.id,
        adminId: randomUUID(),
        action: "reject",
        fromStatus: "pending",
        toStatus: "rejected",
        note: "Existing history",
      })
      .returning()
      .get();
    migrate(db, { migrationsFolder: "drizzle" });
    migrate(db, { migrationsFolder: "drizzle" });
    assert.deepEqual(db.select().from(submissions).all(), [batch]);
    const upgradedPhoto = sqlite
      .prepare<[string], Record<string, unknown>>(
        "SELECT * FROM photos WHERE id = ?",
      )
      .get(photo.id);
    assert.equal(upgradedPhoto?.preview_key, null);
    const { preview_key: preview, ...preservedPhoto } = upgradedPhoto!;
    void preview;
    assert.deepEqual(preservedPhoto, beforePhoto);
    assert.deepEqual(db.select().from(moderationLogs).all(), [log]);
    assert.deepEqual(db.select().from(user).all(), []);
    assert.equal(
      sqlite
        .prepare<[], { count: number }>(
          "SELECT count(*) AS count FROM __drizzle_migrations",
        )
        .get()?.count,
      journal.entries.length,
    );
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
