import { rejectionSchema } from "@/lib/validations/moderation";
import { requireAdmin } from "@/server/auth/admin";
import { moderationErrorResponse, ok } from "@/server/api/moderation-response";
import { getModerationService } from "@/server/services/moderation";
import { assertTrustedOrigin } from "@/server/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const admin = await requireAdmin(request.headers);
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: { code: "INVALID_INPUT", message: "请求格式不正确。" } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const parsed = rejectionSchema.safeParse(body);
    if (!parsed.success)
      return Response.json(
        { error: { code: "INVALID_INPUT", message: "拒绝原因格式不正确。" } },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    const { id } = await context.params;
    return ok(
      getModerationService().rejectPhoto(id, admin.user.id, parsed.data.reason),
    );
  } catch (error) {
    return moderationErrorResponse(error);
  }
}
