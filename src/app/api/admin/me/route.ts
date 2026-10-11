import {
  authenticationErrorResponse,
  requireAdmin,
  toAdminUser,
} from "@/server/auth/admin";
import { passwordChangeRequired } from "@/server/auth/bootstrap-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request.headers, true);
    return Response.json(
      {
        data: {
          user: toAdminUser(admin),
          passwordChangeRequired: passwordChangeRequired(admin.user.id),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return authenticationErrorResponse(error);
  }
}
