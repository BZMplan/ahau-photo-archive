import "server-only";
import { openDatabase } from "./connection";

const globalForDatabase = globalThis as typeof globalThis & {
  archiveDatabase?: ReturnType<typeof openDatabase>;
};

export function getDb() {
  globalForDatabase.archiveDatabase ??= openDatabase();
  return globalForDatabase.archiveDatabase.db;
}
