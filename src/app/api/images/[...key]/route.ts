import { and, eq, isNotNull, or } from "drizzle-orm";
import { getDb } from "@/server/db";
import { photos } from "@/server/db/schema";
import { getStorage } from "@/server/storage";
import { readStorageEnvironment } from "@/server/storage/environment";
import { assertStorageKey } from "@/server/storage/keys";
import { StorageError } from "@/server/storage/errors";
import { PUBLIC_CACHE_CONTROL } from "@/server/storage/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  try {
    if (readStorageEnvironment().driver !== "local") return missing();
    const key = (await context.params).key.join("/");
    assertStorageKey("public", key);
    const photo = getDb()
      .select({ id: photos.id })
      .from(photos)
      .where(
        and(
          eq(photos.id, key.split("/")[1]),
          eq(photos.status, "approved"),
          isNotNull(photos.publishedAt),
          isNotNull(photos.displayKey),
          isNotNull(photos.thumbnailKey),
          or(eq(photos.displayKey, key), eq(photos.thumbnailKey, key)),
        ),
      )
      .get();
    if (!photo) return missing();
    const buffer = await getStorage().public.get(key);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(buffer.length),
        "Cache-Control": PUBLIC_CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (
      error instanceof StorageError &&
      ["NOT_FOUND", "INVALID_KEY"].includes(error.code)
    )
      return missing();
    return Response.json(
      { error: { code: "STORAGE_UNAVAILABLE", message: "图片暂时不可用。" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
function missing() {
  return Response.json(
    { error: { code: "NOT_FOUND", message: "图片不存在。" } },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
