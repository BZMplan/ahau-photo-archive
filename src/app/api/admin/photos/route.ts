import { requireAdmin } from "@/server/auth/admin";
import { moderationErrorResponse, ok } from "@/server/api/moderation-response";
import { getModerationService } from "@/server/services/moderation";
import type { PhotoStatus } from "@/types/photo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin(request.headers);
    const url = new URL(request.url);
    const rawStatus = url.searchParams.get("status") as PhotoStatus | null;
    const status =
      rawStatus &&
      ["pending", "approved", "rejected", "hidden"].includes(rawStatus)
        ? rawStatus
        : "approved";
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "24");
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 50
    )
      return Response.json(
        { error: { code: "INVALID_INPUT", message: "分页参数不正确。" } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    return ok(getModerationService().listPhotos({ status, page, pageSize }));
  } catch (error) {
    return moderationErrorResponse(error);
  }
}
