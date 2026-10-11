import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { createStorage } from "../src/server/storage";
import { createR2Client } from "../src/server/storage/r2";
import { readStorageEnvironment } from "../src/server/storage/environment";
import { originalKey } from "../src/server/storage/keys";
import { StorageError } from "../src/server/storage/errors";

async function check() {
  loadEnvConfig(process.cwd());
  const environment = readStorageEnvironment();
  if (environment.driver === "r2") {
    if (!process.argv.includes("--allow-r2"))
      throw new Error(
        "R2 检查需要显式参数 --allow-r2；本命令仅检查 Bucket 可达性，不修改 Cloudflare 配置。",
      );
    const client = createR2Client(environment);
    try {
      for (const bucket of [
        environment.privateBucket,
        environment.publicBucket,
      ])
        await client.send(new HeadBucketCommand({ Bucket: bucket }), {
          abortSignal: AbortSignal.timeout(30_000),
        });
      console.log(
        "R2 Bucket HEAD 检查通过。请在控制台另行确认私有桶未公开；此检查不验证公开写入或 CDN 配置。",
      );
    } catch {
      throw new Error(
        "R2 连接检查失败，请核对端点、Bucket 与最小权限 Token。未输出内部凭据或响应。",
      );
    } finally {
      client.destroy();
    }
    return;
  }
  const storage = createStorage(environment);
  const key = originalKey(randomUUID(), "png");
  const bytes = await sharp({
    create: { width: 16, height: 12, channels: 3, background: "#37664a" },
  })
    .png()
    .toBuffer();
  try {
    await storage.private.put(key, bytes, {
      contentType: "image/png",
      ifAbsent: true,
    });
    if (!(await storage.private.get(key)).equals(bytes))
      throw new Error("本地存储字节校验失败。");
    console.log("LocalStorage 私有写入、读取与字节校验通过。");
  } finally {
    try {
      await storage.private.delete(key);
      await storage.private.delete(key);
    } catch {
      console.error(
        JSON.stringify({ event: "storage_probe_cleanup_failed", key }),
      );
      throw new Error(
        "临时探测文件清理失败，请按记录 Key 检查；不影响已有用户文件。",
      );
    }
  }
  console.log("临时探测文件已删除，重复删除通过；未创建数据库照片或公开图片。");
}
check().catch((error: unknown) => {
  console.error(
    error instanceof StorageError
      ? `存储检查失败：${error.code}`
      : error instanceof Error
        ? error.message
        : "存储检查失败。",
  );
  process.exitCode = 1;
});
