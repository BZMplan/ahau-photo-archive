import { requireAdmin } from "@/server/auth/admin";
import { moderationErrorResponse, ok } from "@/server/api/moderation-response";
import { getModerationService } from "@/server/services/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(_request.headers);
    const { id } = await context.params;
    const service = getModerationService();
    return ok({ photo: service.getPhoto(id), logs: service.listLogs(id) });
  } catch (error) {
    return moderationErrorResponse(error);
  }
}
