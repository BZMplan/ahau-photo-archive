import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "dist/native");
const standalone = join(root, ".next/standalone");
const required = [
  ".next/standalone/server.js",
  ".next/static",
  "public",
  ".output/migrations/scripts/migrate.js",
  ".output/bootstrap.cjs",
  ".output/admin-recover.cjs",
  "drizzle/meta/_journal.json",
];

for (const path of required) {
  if (!existsSync(join(root, path)))
    throw new Error(`Missing ${path}; run pnpm build:native.`);
}

const journal = JSON.parse(
  readFileSync(join(root, "drizzle/meta/_journal.json"), "utf8"),
);
if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
  throw new Error("Drizzle migration journal is empty.");
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(standalone, output, { recursive: true, verbatimSymlinks: true });
cpSync(join(root, ".next/static"), join(output, ".next/static"), {
  recursive: true,
});
cpSync(join(root, "public"), join(output, "public"), { recursive: true });
cpSync(join(root, ".output/migrations"), join(output, "migrations"), {
  recursive: true,
});
cpSync(
  join(root, ".output/bootstrap.cjs"),
  join(output, "migrations/bootstrap.cjs"),
);
cpSync(
  join(root, ".output/admin-recover.cjs"),
  join(output, "migrations/admin-recover.cjs"),
);
cpSync(
  join(root, "scripts/start-production.sh"),
  join(output, "start-production.sh"),
);
cpSync(join(root, "drizzle"), join(output, "drizzle"), { recursive: true });

const modules = ["@next/env", "better-sqlite3", "drizzle-orm", "zod"];
for (const name of modules) {
  const source = join(root, "node_modules", name);
  if (!existsSync(source))
    throw new Error(`Missing migration dependency ${name}.`);
  cpSync(source, join(output, "migrations/node_modules", name), {
    recursive: true,
    dereference: true,
    filter: (path) => !/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/.test(path),
  });
}
for (const name of [
  "backup-db.mjs",
  "restore-db.mjs",
  "check-migrations.mjs",
  "read-secret.mjs",
  "admin-credentials.mjs",
]) {
  cpSync(join(root, "scripts", name), join(output, "migrations/scripts", name));
}

// Tracing must never turn a developer's local data or secrets into a release.
function inspect(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    const relative = path.slice(output.length + 1);
    if (
      item.name.startsWith(".env") ||
      /\.(?:sqlite|db)(?:-(?:wal|shm))?$/.test(item.name) ||
      ["data", "uploads", "backups", ".git", "tests"].includes(relative)
    )
      throw new Error(`Forbidden release content: ${relative}`);
    if (item.isSymbolicLink()) {
      const target = realpathSync(path);
      if (!target.startsWith(output + "/")) {
        throw new Error(`Release symlink escapes package: ${relative}`);
      }
    }
    if (item.isDirectory()) inspect(path);
  }
}
inspect(output);

// Resolve from the release, not the source checkout, and load both native addons.
const appRequire = createRequire(join(output, "server.js"));
const migrationRequire = createRequire(
  join(output, "migrations/scripts/backup-db.mjs"),
);
appRequire("sharp");
const Database = migrationRequire("better-sqlite3");
new Database(":memory:").close();

const libc =
  process.platform === "linux"
    ? process.report.getReport().header.glibcVersionRuntime
      ? "glibc"
      : "other"
    : "not-linux";
writeFileSync(
  join(output, "build-info.json"),
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      libc,
      migrations: journal.entries.length,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Native release ready: ${output}`);
