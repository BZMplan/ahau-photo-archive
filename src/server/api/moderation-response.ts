import "server-only";

import {
  authenticationErrorResponse,
  AuthenticationError,
} from "@/server/auth/admin";
import { ImageOperationError } from "@/server/services/image-service";
import { ModerationError } from "@/server/services/moderation";
import { StorageError } from "@/server/storage/errors";
import { TrustedOriginError } from "@/server/security/origin";

export function moderationErrorResponse(error: unknown): Response {
  if (error instanceof AuthenticationError)
    return authenticationErrorResponse(error);
  if (error instanceof TrustedOriginError)
    return Response.json(
      { error: { code: "FORBIDDEN_ORIGIN", message: error.message } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  if (error instanceof ModerationError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "CONFLICT"
          ? 409
          : error.code === "INVALID_INPUT"
            ? 422
            : error.code === "STORAGE_FAILURE"
              ? 503
              : 500;
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof StorageError || error instanceof ImageOperationError)
    return Response.json(
      {
        error: {
          code: "STORAGE_UNAVAILABLE",
          message: "图片存储暂时不可用，请稍后重试。",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  console.error(
    JSON.stringify({ event: "moderation_api_error", code: "INTERNAL_ERROR" }),
  );
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "服务器暂时无法完成操作。" } },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export function ok<T>(data: T, status = 200): Response {
  return Response.json(
    { data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
