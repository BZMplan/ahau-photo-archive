import { resolve } from "node:path";

export function getDatabasePath(): string {
  // Runtime data is mounted separately and must never be traced into the server bundle.
  return resolve(
    /* turbopackIgnore: true */ process.env.DATABASE_PATH ||
      "./data/archive.sqlite",
  );
}
