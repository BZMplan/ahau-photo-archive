import { eq } from "drizzle-orm";
import {
  AuthenticationError,
  BootstrapPasswordChangeError,
  authenticationErrorResponse,
  requireAdmin,
} from "@/server/auth/admin";
import { getDb } from "@/server/db";
import { photos } from "@/server/db/schema";
import { getImageService } from "@/server/services/image-service";
import { assertPhotoId, previewKey } from "@/server/storage/keys";
import { StorageError } from "@/server/storage/errors";
import { PRIVATE_CACHE_CONTROL } from "@/server/storage/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(request.headers);
    const { id } = await context.params;
    assertPhotoId(id);
    const photo = getDb()
      .select({ previewKey: photos.previewKey })
      .from(photos)
      .where(eq(photos.id, id))
      .get();
    if (!photo?.previewKey || photo.previewKey !== previewKey(id))
      return missing();
    const buffer = await getImageService().getPrivateImage(
      id,
      photo.previewKey,
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": PRIVATE_CACHE_CONTROL,
        "Content-Length": String(buffer.length),
        "X-Content-Type-Options": "nosniff",
        Vary: "Cookie",
      },
    });
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof BootstrapPasswordChangeError
    )
      return authenticationErrorResponse(error);
    if (
      error instanceof StorageError &&
      ["NOT_FOUND", "INVALID_KEY"].includes(error.code)
    )
      return missing();
    return Response.json(
      {
        error: {
          code: "STORAGE_UNAVAILABLE",
          message: "暂时无法读取私有预览，请稍后重试。",
        },
      },
      { status: 503, headers: { "Cache-Control": PRIVATE_CACHE_CONTROL } },
    );
  }
}
function missing() {
  return Response.json(
    { error: { code: "NOT_FOUND", message: "照片预览不存在。" } },
    { status: 404, headers: { "Cache-Control": PRIVATE_CACHE_CONTROL } },
  );
}
