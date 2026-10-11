import { cpSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
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
process.env.HOSTNAME ||= "127.0.0.1";
cpSync(join(root, ".next/static"), join(standalone, ".next/static"), {
  recursive: true,
});
cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
await import(pathToFileURL(join(standalone, "server.js")).href);
