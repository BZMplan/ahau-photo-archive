import { loadEnvConfig } from "@next/env";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../src/server/db/connection";

loadEnvConfig(process.cwd());
try {
  const { db, sqlite } = openDatabase();
  try {
    migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Database migrations applied.");
  } finally {
    sqlite.close();
  }
} catch (error) {
  console.error(
    `Database migration failed: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exitCode = 1;
}
