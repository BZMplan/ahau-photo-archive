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
    const { id } = await context.params;
    let reason: string | undefined;
    try {
      const body: unknown = await request.json();
      if (
        body &&
        typeof body === "object" &&
        "reason" in body &&
        typeof body.reason === "string"
      )
        reason = body.reason;
    } catch {
      // An empty body is valid for a hide operation.
    }
    return ok(
      await getModerationService().hidePhoto(
        id,
        admin.user.id,
        request.headers,
        reason,
      ),
    );
  } catch (error) {
    return moderationErrorResponse(error);
  }
}
