import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";

const databasePath = resolve(
  process.env.DATABASE_PATH || "./data/archive.sqlite",
);

function main() {
  if (!existsSync(databasePath))
    throw new Error("数据库不存在，请先执行 Migration。");
  const journal = JSON.parse(
    readFileSync("./drizzle/meta/_journal.json", "utf8"),
  );
  const entries = journal.entries;
  if (!Array.isArray(entries) || entries.length === 0)
    throw new Error("Migration 清单无效。");
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const table = database
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
      )
      .get();
    if (!table) throw new Error("数据库尚未执行 Migration。");
    const applied = database
      .prepare(
        "SELECT count(*) AS count, max(created_at) AS latest FROM __drizzle_migrations",
      )
      .get();
    const latestExpected = entries.at(-1)?.when;
    if (
      typeof latestExpected !== "number" ||
      applied.count < entries.length ||
      applied.latest < latestExpected
    ) {
      throw new Error("数据库 Migration 落后于当前镜像，请先备份并显式迁移。");
    }
  } finally {
    database.close();
  }
}

try {
  main();
} catch (error) {
  console.error(
    `启动检查失败：${error instanceof Error ? error.message : "未知错误"}`,
  );
  process.exitCode = 1;
}
