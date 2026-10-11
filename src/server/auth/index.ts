import "server-only";
import { getDb } from "@/server/db";
import { readAuthEnvironment } from "./environment";
import { createArchiveAuth } from "./options";

let instance: ReturnType<typeof createArchiveAuth> | undefined;

export function getAuth() {
  instance ??= createArchiveAuth(getDb(), readAuthEnvironment());
  return instance;
}
