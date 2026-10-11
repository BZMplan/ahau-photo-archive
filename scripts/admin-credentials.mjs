import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";

const databasePath = resolve(
  process.env.DATABASE_PATH || "./data/archive.sqlite",
);
const path = join(dirname(databasePath), "bootstrap/admin-credentials");
try {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("只能在可信本地终端查看初始凭据。");
  if ((statSync(path).mode & 0o077) !== 0)
    throw new Error("初始凭据文件权限不安全。");
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const state = database
      .prepare(
        "SELECT password_change_required AS required FROM bootstrap_state WHERE id=1",
      )
      .get();
    if (!state?.required) throw new Error("初始密码已失效或由管理员自行配置。");
  } finally {
    database.close();
  }
  const credentials = JSON.parse(readFileSync(path, "utf8"));
  process.stdout.write(
    `初始管理员邮箱：${credentials.email}\n初始管理员密码：${credentials.password}\n请登录后立即修改密码。\n`,
  );
} catch (error) {
  console.error(
    `无法读取初始凭据：${error instanceof Error ? error.message : "未知错误"}`,
  );
  process.exitCode = 1;
}
