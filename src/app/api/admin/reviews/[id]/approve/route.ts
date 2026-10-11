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
    return ok(
      await getModerationService().approvePhoto(
        id,
        admin.user.id,
        request.headers,
      ),
    );
  } catch (error) {
    return moderationErrorResponse(error);
  }
}
