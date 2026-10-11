import "server-only";
import {
  authenticationErrorResponse,
  AuthenticationError,
  BootstrapPasswordChangeError,
} from "@/server/auth/admin";
import { TrustedOriginError } from "@/server/security/origin";
import { AdminAccountError } from "@/server/services/admin-account";

export async function readSettingsBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") || 0) > 8192)
    throw new AdminAccountError("INVALID_INPUT", "请求内容过大。");
  try {
    if (!request.body) throw new Error("empty body");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new AdminAccountError("INVALID_INPUT", "请求内容过大。");
      }
      chunks.push(value);
    }
    return JSON.parse(
      new TextDecoder().decode(Buffer.concat(chunks)),
    ) as unknown;
  } catch (error) {
    if (error instanceof AdminAccountError) throw error;
    throw new AdminAccountError("INVALID_INPUT", "请求格式不正确。");
  }
}
export function accountSettingsErrorResponse(error: unknown): Response {
  if (
    error instanceof AuthenticationError ||
    error instanceof BootstrapPasswordChangeError
  )
    return authenticationErrorResponse(error);
  if (error instanceof TrustedOriginError)
    return Response.json(
      { error: { code: "FORBIDDEN_ORIGIN", message: error.message } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  if (error instanceof AdminAccountError)
    return Response.json(
      { error: { code: error.code, message: error.message } },
      {
        status: error.code === "EMAIL_IN_USE" ? 409 : 422,
        headers: { "Cache-Control": "no-store" },
      },
    );
  console.error(
    JSON.stringify({ event: "admin_settings_error", code: "INTERNAL_ERROR" }),
  );
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "服务器暂时无法完成操作。" } },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}
