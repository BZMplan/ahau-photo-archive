import {
  authenticationErrorResponse,
  requireAdmin,
  toAdminUser,
} from "@/server/auth/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request.headers);
    return Response.json(
      { data: { user: toAdminUser(admin) } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return authenticationErrorResponse(error);
  }
}
