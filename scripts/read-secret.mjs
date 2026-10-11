import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
const database = resolve(process.env.DATABASE_PATH || "./data/archive.sqlite");
process.stdout.write(
  readFileSync(
    join(dirname(database), "bootstrap/better-auth-secret"),
    "utf8",
  ).trim(),
);
