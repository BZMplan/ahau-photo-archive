import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { imageOperations } from "../db/schema";
import type { openDatabase } from "../db/connection";
import type { StorageScope } from "./types";
export type ImageOperation = typeof imageOperations.$inferSelect;
export type OperationObject = { scope: StorageScope; key: string };
export interface OperationJournal {
  begin(
    photoId: string,
    action: ImageOperation["action"],
    objects: OperationObject[],
  ): ImageOperation;
  update(id: string, state: ImageOperation["state"], errorCode?: string): void;
  find(id: string): ImageOperation | undefined;
}
export class SqliteOperationJournal implements OperationJournal {
  constructor(private readonly db: ReturnType<typeof openDatabase>["db"]) {}
  begin(
    photoId: string,
    action: ImageOperation["action"],
    objects: OperationObject[],
  ) {
    return this.db
      .insert(imageOperations)
      .values({ photoId, action, objects, state: "writing" })
      .returning()
      .get();
  }
  update(id: string, state: ImageOperation["state"], errorCode?: string) {
    const result = this.db
      .update(imageOperations)
      .set({ state, errorCode: errorCode ?? null, updatedAt: new Date() })
      .where(eq(imageOperations.id, id))
      .run();
    if (!result.changes)
      throw new Error("Image operation record does not exist.");
  }
  find(id: string) {
    return this.db
      .select()
      .from(imageOperations)
      .where(eq(imageOperations.id, id))
      .get();
  }
}
export function getOperationJournal(): OperationJournal {
  return new SqliteOperationJournal(getDb());
}
