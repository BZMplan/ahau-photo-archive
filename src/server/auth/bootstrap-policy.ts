import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { bootstrapState } from "@/server/db/schema";

export function passwordChangeRequired(userId: string): boolean {
  return !!getDb()
    .select({ id: bootstrapState.id })
    .from(bootstrapState)
    .where(
      and(
        eq(bootstrapState.id, 1),
        eq(bootstrapState.adminId, userId),
        eq(bootstrapState.passwordChangeRequired, true),
      ),
    )
    .get();
}
