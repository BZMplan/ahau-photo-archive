import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";
import { openDatabase } from "../src/server/db/connection";
import { user } from "../src/server/db/auth-schema";
import { readAuthEnvironment } from "../src/server/auth/environment";

function initialize() {
  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    process.argv.length > 2
  ) {
    throw new Error(
      "请在本地交互式终端执行 pnpm admin:init；不接受参数、管道或环境变量密码。",
    );
  }
  loadEnvConfig(process.cwd());
  readAuthEnvironment();
  const { db, sqlite } = openDatabase();
  try {
    if (
      db.select({ id: user.id }).from(user).where(eq(user.role, "admin")).get()
    ) {
      throw new Error("已有管理员，初始化已停止。请使用已有账号登录。");
    }
  } finally {
    sqlite.close();
  }
  // The official CLI owns masked password input and Better Auth's createUser/hash flow.
  const cliPath = fileURLToPath(
    new URL("../node_modules/auth/dist/index.mjs", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [cliPath, "create-admin", "--config", "src/server/auth/cli.ts"],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

try {
  initialize();
} catch (error) {
  console.error(error instanceof Error ? error.message : "管理员初始化失败。");
  process.exitCode = 1;
}
