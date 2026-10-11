import { authenticationErrorResponse, requireAdmin } from "@/server/auth/admin";

export async function GET(request: Request) {
  try {
    await requireAdmin(request.headers);
  } catch (error) {
    return authenticationErrorResponse(error);
  }
  return Response.json(
    { error: { code: "NOT_IMPLEMENTED", message: "照片管理 API 尚未开放。" } },
    { status: 501, headers: { "Cache-Control": "no-store" } },
  );
}
