import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";

const root = process.cwd();
const standalone = join(root, ".next/standalone");
if (!existsSync(join(standalone, "server.js"))) {
  console.error("Production build not found. Run pnpm build first.");
  process.exit(1);
}

nextEnv.loadEnvConfig(root);
// standalone changes cwd, so preserve the persistent database's absolute path first.
process.env.DATABASE_PATH = resolve(
  process.env.DATABASE_PATH || "./data/archive.sqlite",
);
if (process.env.LOCAL_STORAGE_PATH)
  process.env.LOCAL_STORAGE_PATH = resolve(process.env.LOCAL_STORAGE_PATH);
process.env.HOSTNAME ||= "127.0.0.1";
const bootstrap = spawnSync(
  process.execPath,
  [join(root, ".output/bootstrap.cjs")],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);
if (bootstrap.error) throw bootstrap.error;
if (bootstrap.status !== 0) process.exit(bootstrap.status ?? 1);
if (!process.env.BETTER_AUTH_SECRET)
  process.env.BETTER_AUTH_SECRET = readFileSync(
    join(dirname(process.env.DATABASE_PATH), "bootstrap/better-auth-secret"),
    "utf8",
  ).trim();
cpSync(join(root, ".next/static"), join(standalone, ".next/static"), {
  recursive: true,
});
cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
await import(pathToFileURL(join(standalone, "server.js")).href);
