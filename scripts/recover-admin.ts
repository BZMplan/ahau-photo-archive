import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { hashPassword } from "better-auth/crypto";
import { openDatabase } from "../src/server/db/connection";
import { getDatabasePath } from "../src/server/db/path";

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.length > 2)
    throw new Error("只能在可信本地交互终端执行，且不接受命令行参数。");
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let email: string;
  try {
    email = (await terminal.question("输入要恢复的管理员邮箱："))
      .trim()
      .toLowerCase();
  } finally {
    terminal.close();
  }
  const { sqlite } = openDatabase();
  try {
    const admin = sqlite
      .prepare("SELECT id FROM user WHERE email=? AND role='admin'")
      .get(email) as { id: string } | undefined;
    if (!admin) throw new Error("未找到该管理员；未修改任何账户。");
    const path = join(
      dirname(getDatabasePath()),
      "bootstrap/admin-credentials",
    );
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    if (existsSync(path))
      throw new Error("已有未领取的初始凭据；先检查该文件，再决定是否恢复。");
    const password = randomBytes(32).toString("base64url");
    const hash = await hashPassword(password);
    writeFileSync(path, JSON.stringify({ email, password }) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    try {
      sqlite.transaction(() => {
        const credential = sqlite
          .prepare(
            "SELECT id FROM account WHERE user_id=? AND provider_id='credential'",
          )
          .get(admin.id) as { id: string } | undefined;
        if (credential)
          sqlite
            .prepare("UPDATE account SET password=?, updated_at=? WHERE id=?")
            .run(hash, Date.now(), credential.id);
        else
          sqlite
            .prepare(
              "INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)",
            )
            .run(
              randomUUID(),
              admin.id,
              admin.id,
              hash,
              Date.now(),
              Date.now(),
            );
        sqlite.prepare("DELETE FROM session WHERE user_id=?").run(admin.id);
        sqlite
          .prepare(
            "UPDATE bootstrap_state SET admin_id=?, password_change_required=1 WHERE id=1",
          )
          .run(admin.id);
      })();
    } catch (error) {
      // Keep the protected file for diagnosis; no plaintext reaches logs.
      throw error;
    }
    console.log(
      "管理员恢复完成。请使用 admin:credentials 在本地领取一次性密码，并在登录后立即修改。",
    );
  } finally {
    sqlite.close();
  }
}
main().catch((error: unknown) => {
  console.error(
    `管理员恢复失败：${error instanceof Error ? error.message : "未知错误"}`,
  );
  process.exitCode = 1;
});
