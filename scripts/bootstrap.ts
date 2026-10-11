import { loadEnvConfig } from "@next/env";
import { runBootstrap } from "../src/server/bootstrap";

loadEnvConfig(process.cwd());
runBootstrap().catch((error: unknown) => {
  console.error(
    `系统初始化失败：${error instanceof Error ? error.message : "未知错误"}`,
  );
  process.exitCode = 1;
});
