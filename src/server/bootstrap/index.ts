import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  AbortMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../db/connection";
import { getDatabasePath } from "../db/path";
import { readAuthEnvironment } from "../auth/environment";
import { createArchiveAuth } from "../auth/options";
import { readStorageEnvironment } from "../storage/environment";
import { assertProductionTurnstileConfiguration } from "../security/turnstile-config";

const markerName = "auth-secret-state.json";
const secretName = "better-auth-secret";
const credentialName = "admin-credentials";
const defaultEmail = "admin@localhost.invalid";

function protectedFile(path: string): string {
  const info = lstatSync(path);
  if (!info.isFile() || (info.mode & 0o077) !== 0)
    throw new Error(`敏感文件权限不安全：${path}`);
  return readFileSync(path, "utf8");
}

function writeOnce(path: string, content: string): void {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, content);
  } finally {
    closeSync(fd);
  }
}

function bootstrapDirectory(): string {
  const path = join(dirname(getDatabasePath()), "bootstrap");
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
    throw new Error("Bootstrap 目录必须仅允许服务用户访问（0700）。");
  return path;
}

function initializeSecret(databaseExisted: boolean): void {
  const directory = bootstrapDirectory();
  const markerPath = join(directory, markerName);
  const secretPath = join(directory, secretName);
  const configured = process.env.BETTER_AUTH_SECRET?.trim();
  if (configured && configured !== process.env.BETTER_AUTH_SECRET)
    throw new Error("BETTER_AUTH_SECRET 不能包含首尾空格。");
  let secret = configured;
  if (!secret) {
    if (!existsSync(secretPath)) {
      if (databaseExisted || existsSync(markerPath))
        throw new Error(
          "已有数据库缺少 BETTER_AUTH_SECRET；拒绝自动轮换认证密钥。",
        );
      writeOnce(secretPath, randomBytes(48).toString("base64url") + "\n");
    }
    secret = protectedFile(secretPath).trim();
  }
  const fingerprint = createHash("sha256").update(secret).digest("hex");
  if (existsSync(markerPath)) {
    const marker: unknown = JSON.parse(protectedFile(markerPath));
    if (
      !marker ||
      typeof marker !== "object" ||
      !("fingerprint" in marker) ||
      marker.fingerprint !== fingerprint
    )
      throw new Error("BETTER_AUTH_SECRET 与首次记录不符；拒绝意外轮换。");
  } else {
    writeOnce(markerPath, JSON.stringify({ fingerprint }) + "\n");
  }
  process.env.BETTER_AUTH_SECRET = secret;
  readAuthEnvironment();
}

function migrationStatus(sqlite: ReturnType<typeof openDatabase>["sqlite"]) {
  const journal = JSON.parse(
    readFileSync("./drizzle/meta/_journal.json", "utf8"),
  );
  const entries = journal.entries;
  if (!Array.isArray(entries) || entries.length === 0)
    throw new Error("Migration 清单无效。");
  const expected = entries.at(-1)?.when;
  if (typeof expected !== "number") throw new Error("Migration 时间戳无效。");
  const hasTable = sqlite
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
    )
    .get();
  if (!hasTable) return { pending: true, expected };
  const applied = sqlite
    .prepare(
      "SELECT count(*) AS count, max(created_at) AS latest FROM __drizzle_migrations",
    )
    .get() as { count: number; latest: number | null };
  if ((applied.latest ?? 0) > expected || applied.count > entries.length)
    throw new Error("数据库 Schema 比当前代码新，拒绝回退 Migration。");
  return {
    pending: applied.count < entries.length || (applied.latest ?? 0) < expected,
    expected,
  };
}

function initializeDatabase(databaseExisted: boolean) {
  mkdirSync(dirname(getDatabasePath()), { recursive: true, mode: 0o700 });
  const opened = openDatabase();
  try {
    if (
      databaseExisted &&
      opened.sqlite.pragma("quick_check", { simple: true }) !== "ok"
    )
      throw new Error("现有 SQLite 数据库完整性检查失败。");
    if (migrationStatus(opened.sqlite).pending) {
      if (databaseExisted) {
        const script = existsSync("./migrations/scripts/backup-db.mjs")
          ? "./migrations/scripts/backup-db.mjs"
          : "./scripts/backup-db.mjs";
        execFileSync(process.execPath, [script], { stdio: "inherit" });
      }
      migrate(opened.db, { migrationsFolder: "./drizzle" });
    }
    if (migrationStatus(opened.sqlite).pending)
      throw new Error("数据库 Migration 未完成。");
    for (const name of [
      "user",
      "session",
      "account",
      "verification",
      "bootstrap_state",
    ])
      if (
        !opened.sqlite
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
          .get(name)
      )
        throw new Error(`认证数据表缺失：${name}`);
    return opened;
  } catch (error) {
    opened.sqlite.close();
    throw error;
  }
}

function ensureWritableDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error(`存储目录无效：${path}`);
  const probe = join(path, `.bootstrap-${randomUUID()}`);
  writeOnce(probe, "");
  unlinkSync(probe);
}

async function initializeStorage(): Promise<void> {
  const storage = readStorageEnvironment();
  if (storage.driver === "local") {
    ensureWritableDirectory(storage.root);
    ensureWritableDirectory(join(storage.root, "private"));
    ensureWritableDirectory(join(storage.root, "public"));
    return;
  }
  const autoCreate = process.env.R2_AUTO_CREATE_BUCKETS === "true";
  if (
    process.env.R2_AUTO_CREATE_BUCKETS &&
    !["true", "false"].includes(process.env.R2_AUTO_CREATE_BUCKETS)
  )
    throw new Error("R2_AUTO_CREATE_BUCKETS 必须是 true 或 false。");
  const client = new S3Client({
    endpoint: `https://${storage.accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    credentials: {
      accessKeyId: storage.accessKeyId,
      secretAccessKey: storage.secretAccessKey,
    },
    maxAttempts: 2,
  });
  try {
    for (const bucket of [storage.privateBucket, storage.publicBucket]) {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (error) {
        const status =
          error && typeof error === "object" && "$metadata" in error
            ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
            : undefined;
        if (status !== 404 || !autoCreate)
          throw new Error(`R2 Bucket ${bucket} 不存在或无访问权限。`, {
            cause: error,
          });
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      }
      await client.send(
        new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }),
      );
      // An uncompleted multipart upload checks write permission without exposing an object.
      const key = `bootstrap-probe/${randomUUID()}`;
      const started = await client.send(
        new CreateMultipartUploadCommand({ Bucket: bucket, Key: key }),
      );
      if (!started.UploadId)
        throw new Error(`R2 Bucket ${bucket} 未返回上传 ID。`);
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: started.UploadId,
        }),
      );
    }
  } catch (error) {
    throw new Error(
      `R2 初始化检查失败：${error instanceof Error ? error.message : "未知错误"}`,
    );
  } finally {
    client.destroy();
  }
}

function adminSettings() {
  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL || defaultEmail)
    .trim()
    .toLowerCase();
  const name = (process.env.ADMIN_BOOTSTRAP_NAME || "Administrator").trim();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new Error("ADMIN_BOOTSTRAP_EMAIL 格式无效。");
  if (name.length < 1 || name.length > 80)
    throw new Error("ADMIN_BOOTSTRAP_NAME 长度必须为 1–80 字符。");
  if (
    password &&
    (password.length < 12 ||
      password.length > 128 ||
      !/[A-Za-z]/.test(password) ||
      !/[0-9]/.test(password))
  )
    throw new Error(
      "ADMIN_BOOTSTRAP_PASSWORD 需为 12–128 字符且包含字母和数字。",
    );
  return { email, name, password };
}

async function initializeAdmin(
  opened: ReturnType<typeof openDatabase>,
): Promise<void> {
  const sqlite = opened.sqlite;
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const marker = sqlite
      .prepare("SELECT admin_id FROM bootstrap_state WHERE id=1")
      .get() as { admin_id: string } | undefined;
    const existing = sqlite
      .prepare("SELECT id FROM user WHERE role='admin' LIMIT 1")
      .get() as { id: string } | undefined;
    if (!existing && marker)
      throw new Error(
        "原管理员已不存在；请使用本地恢复流程，重启不会自动创建替代账户。",
      );
    if (existing && !marker) {
      sqlite
        .prepare(
          "INSERT INTO bootstrap_state (id, admin_id, password_change_required, created_at) VALUES (1, ?, 0, ?)",
        )
        .run(existing.id, Date.now());
    } else if (!existing) {
      const settings = adminSettings();
      const credentialPath = join(bootstrapDirectory(), credentialName);
      let password = settings.password;
      if (!password) {
        if (existsSync(credentialPath)) {
          const saved: unknown = JSON.parse(protectedFile(credentialPath));
          if (
            !saved ||
            typeof saved !== "object" ||
            !("email" in saved) ||
            !("password" in saved) ||
            saved.email !== settings.email ||
            typeof saved.password !== "string"
          )
            throw new Error("已有的初始凭据文件与当前配置不符。");
          password = saved.password;
        } else {
          password = randomBytes(32).toString("base64url");
          writeOnce(
            credentialPath,
            JSON.stringify({ email: settings.email, password }) + "\n",
          );
        }
      }
      const auth = createArchiveAuth(opened.db, readAuthEnvironment());
      const created = await auth.api.createUser({
        body: {
          email: settings.email,
          name: settings.name,
          password,
          role: "admin",
        },
      });
      sqlite
        .prepare(
          "INSERT INTO bootstrap_state (id, admin_id, password_change_required, created_at) VALUES (1, ?, ?, ?)",
        )
        .run(created.user.id, settings.password ? 0 : 1, Date.now());
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    if (sqlite.inTransaction) sqlite.exec("ROLLBACK");
    throw error;
  }
}

export async function runBootstrap(): Promise<void> {
  const databaseExisted = existsSync(getDatabasePath());
  initializeSecret(databaseExisted);
  assertProductionTurnstileConfiguration();
  const opened = initializeDatabase(databaseExisted);
  try {
    await initializeStorage();
    await initializeAdmin(opened);
    if (
      !opened.sqlite
        .prepare("SELECT 1 FROM user WHERE role='admin' LIMIT 1")
        .get()
    )
      throw new Error("管理员账户检查失败。");
  } finally {
    opened.sqlite.close();
  }
  console.log("系统初始化检查完成。");
}

export function bootstrapCredentialPath(): string {
  return join(dirname(getDatabasePath()), "bootstrap", credentialName);
}
