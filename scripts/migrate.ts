import { loadEnvConfig } from "@next/env";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../src/server/db/connection";

loadEnvConfig(process.cwd());
const { db, sqlite } = openDatabase();
try {
  migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Database migrations applied.");
} finally {
  sqlite.close();
}
