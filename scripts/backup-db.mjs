import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";

const databasePath = resolve(
  process.env.DATABASE_PATH || "./data/archive.sqlite",
);
const backupDirectory = resolve(
  process.env.BACKUP_DIR || join(dirname(databasePath), "backups"),
);

async function main() {
  if (!existsSync(databasePath))
    throw new Error("数据库不存在，请先执行迁移。");
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = join(
    backupDirectory,
    `archive-${stamp}-${randomUUID()}.sqlite`,
  );
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    // SQLite's online backup API includes committed WAL pages while writes continue.
    await database.backup(destination);
    chmodSync(destination, 0o600);
    const backup = new Database(destination, { fileMustExist: true });
    try {
      // Make the archive a self-contained file, without WAL/SHM sidecars.
      if (backup.pragma("journal_mode = DELETE", { simple: true }) !== "delete")
        throw new Error("无法完成备份日志检查点。");
      if (backup.pragma("quick_check", { simple: true }) !== "ok")
        throw new Error("备份完整性检查失败。");
    } finally {
      backup.close();
    }
    console.log(`数据库备份完成：${destination}`);
  } catch (error) {
    if (existsSync(destination)) unlinkSync(destination);
    throw error;
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error(
    `数据库备份失败：${error instanceof Error ? error.message : "未知错误"}`,
  );
  process.exitCode = 1;
});
