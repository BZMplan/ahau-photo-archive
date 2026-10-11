import { randomUUID } from "node:crypto";
import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";

const databasePath = resolve(
  process.env.DATABASE_PATH || "./data/archive.sqlite",
);
const backupDirectory = resolve(
  process.env.BACKUP_DIR || join(dirname(databasePath), "backups"),
);

async function main() {
  const name = process.argv[2];
  if (
    process.env.RESTORE_CONFIRM !== "YES" ||
    !name ||
    basename(name) !== name ||
    !/^archive-[\w-]+\.sqlite$/.test(name)
  ) {
    throw new Error(
      "先停止应用，再以 RESTORE_CONFIRM=YES 和备份文件名显式执行恢复。",
    );
  }
  const source = join(backupDirectory, name);
  if (!existsSync(source)) throw new Error("指定备份文件不存在。");
  const backup = new Database(source, { readonly: true, fileMustExist: true });
  try {
    if (backup.pragma("quick_check", { simple: true }) !== "ok")
      throw new Error("备份完整性检查失败。");
    if (
      !backup
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='photos'",
        )
        .get()
    )
      throw new Error("备份缺少业务表。");
  } finally {
    backup.close();
  }
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  if (existsSync(databasePath)) {
    const current = new Database(databasePath, { fileMustExist: true });
    try {
      // Capture the current state, including WAL, before replacing anything.
      const beforeRestore = join(
        backupDirectory,
        `archive-before-restore-${Date.now()}-${randomUUID()}.sqlite`,
      );
      try {
        await current.backup(beforeRestore);
        chmodSync(beforeRestore, 0o600);
        const archive = new Database(beforeRestore, { fileMustExist: true });
        try {
          if (
            archive.pragma("journal_mode = DELETE", { simple: true }) !==
            "delete"
          )
            throw new Error("无法完成恢复前备份日志检查点。");
          if (archive.pragma("quick_check", { simple: true }) !== "ok")
            throw new Error("恢复前备份完整性检查失败。");
        } finally {
          archive.close();
        }
        const checkpoint = current.pragma("wal_checkpoint(TRUNCATE)");
        if (checkpoint[0]?.busy)
          throw new Error("数据库仍有活动连接，停止应用后重试。");
        console.log(`恢复前数据库备份：${beforeRestore}`);
      } catch (error) {
        rmSync(beforeRestore, { force: true });
        throw error;
      }
    } finally {
      current.close();
    }
  }
  const temporary = `${databasePath}.${randomUUID()}.restore`;
  try {
    copyFileSync(source, temporary, constants.COPYFILE_EXCL);
    chmodSync(temporary, 0o600);
    // The app must be stopped: old WAL/SHM cannot be paired with the new main file.
    rmSync(`${databasePath}-wal`, { force: true });
    rmSync(`${databasePath}-shm`, { force: true });
    renameSync(temporary, databasePath);
    console.log(`数据库恢复完成：${name}`);
  } finally {
    rmSync(temporary, { force: true });
  }
}

main().catch((error) => {
  console.error(
    `数据库恢复失败：${error instanceof Error ? error.message : "未知错误"}`,
  );
  process.exitCode = 1;
});
