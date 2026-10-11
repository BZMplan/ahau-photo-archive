import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import nextEnv from "@next/env";

const root = process.cwd();
nextEnv.loadEnvConfig(root);
process.env.DATABASE_PATH = resolve(
  process.env.DATABASE_PATH || "./data/archive.sqlite",
);
if (process.env.LOCAL_STORAGE_PATH)
  process.env.LOCAL_STORAGE_PATH = resolve(process.env.LOCAL_STORAGE_PATH);

const compiled = spawnSync(
  join(root, "node_modules/esbuild/bin/esbuild"),
  [
    "scripts/bootstrap.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--target=node24",
    "--outfile=.output/bootstrap.cjs",
    "--external:better-sqlite3",
    "--external:@next/env",
  ],
  { cwd: root, stdio: "inherit" },
);
if (compiled.error) throw compiled.error;
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
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

const server = spawn(
  process.execPath,
  [join(root, "node_modules/next/dist/bin/next"), "dev"],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.kill(signal));
server.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
