import { getAdminSession } from "@/server/auth/admin";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "需要管理员身份。" } },
      { status: 401 },
    );
  }
  return Response.json(
    { error: { code: "NOT_IMPLEMENTED", message: "照片管理 API 尚未开放。" } },
    { status: 501 },
  );
}
