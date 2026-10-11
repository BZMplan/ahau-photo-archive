import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { normalizeLocation } from "../../lib/validations/archive";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getDatabasePath } from "./path";
import * as schema from "./schema";
import * as authSchema from "./auth-schema";

// Shared by server code and the migration CLI. Client imports are blocked by the server entry point.
export function openDatabase(path = getDatabasePath()) {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // One deterministic rule also covers historical free-text locations in SQL.
  sqlite.function("normalize_location", { deterministic: true }, (value) =>
    typeof value === "string" ? normalizeLocation(value) : "",
  );
  sqlite.pragma("busy_timeout = 5000");
  return {
    sqlite,
    db: drizzle(sqlite, { schema: { ...schema, ...authSchema } }),
  };
}
