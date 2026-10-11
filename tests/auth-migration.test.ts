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
import { moderationLogs } from "../src/server/db/schema";
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
    // Use the historical column list: today's Drizzle insert includes phase-4 fields.
    const batch = { id: randomUUID() };
    sqlite
      .prepare(
        "INSERT INTO submissions (id, attribution, contact, submitted_at) VALUES (?, ?, ?, ?)",
      )
      .run(batch.id, "Existing author", "private@example.invalid", Date.now());
    const beforeSubmission = sqlite
      .prepare("SELECT * FROM submissions WHERE id = ?")
      .get(batch.id);
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
    const adminId = randomUUID();
    sqlite
      .prepare(
        "INSERT INTO moderation_logs (id, photo_id, admin_id, action, from_status, to_status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        randomUUID(),
        photo.id,
        adminId,
        "reject",
        "pending",
        "rejected",
        "Existing history",
        Date.now(),
      );
    migrate(db, { migrationsFolder: "drizzle" });
    migrate(db, { migrationsFolder: "drizzle" });
    const upgradedSubmission = sqlite
      .prepare("SELECT * FROM submissions WHERE id = ?")
      .get(batch.id) as Record<string, unknown>;
    const {
      author_name: _authorName,
      contact_email: _contactEmail,
      message: _message,
      consent_accepted: _consentAccepted,
      consented_at: _consentedAt,
      request_id: _requestId,
      ...preservedSubmission
    } = upgradedSubmission;
    void _authorName;
    void _contactEmail;
    void _message;
    void _consentAccepted;
    void _consentedAt;
    void _requestId;
    assert.deepEqual(preservedSubmission, beforeSubmission);
    const upgradedPhoto = sqlite
      .prepare<[string], Record<string, unknown>>(
        "SELECT * FROM photos WHERE id = ?",
      )
      .get(photo.id);
    assert.equal(upgradedPhoto?.preview_key, null);
    const {
      preview_key: preview,
      publication_id: _publicationId,
      reviewed_by: _reviewedBy,
      reviewed_at: _reviewedAt,
      rejection_reason: _rejectionReason,
      ...preservedPhoto
    } = upgradedPhoto!;
    void preview;
    void _publicationId;
    void _reviewedBy;
    void _reviewedAt;
    void _rejectionReason;
    assert.deepEqual(preservedPhoto, beforePhoto);
    const logs = db.select().from(moderationLogs).all();
    assert.equal(logs.length, 1);
    assert.equal(
      logs[0]?.metadataChanges && Object.keys(logs[0].metadataChanges).length,
      0,
    );
    assert.equal(logs[0]?.adminId, adminId);
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
