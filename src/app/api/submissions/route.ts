import { MAX_SUBMISSION_REQUEST_BYTES } from "@/lib/submission-limits";
import {
  SubmissionError,
  SubmissionRateLimitError,
  createSubmission,
} from "@/server/services/submissions";
import { ImageValidationError } from "@/server/images/errors";
import { StorageError } from "@/server/storage/errors";
import { TurnstileError } from "@/server/security/turnstile";
import {
  SubmissionSecurityError,
  assertSubmissionOrigin,
  getSubmissionSourceKey,
} from "@/server/security/submission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSubmissionOrigin(request);
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_SUBMISSION_REQUEST_BYTES)
      return failure("PAYLOAD_TOO_LARGE", "上传请求超过大小限制。", 413);
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data"))
      return failure(
        "BAD_REQUEST",
        "投稿请求必须使用 multipart/form-data。",
        400,
      );

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return failure("BAD_REQUEST", "无法读取投稿表单。", 400);
    }
    const files = form.getAll("files");
    if (files.some((value) => !(value instanceof File)))
      return failure("BAD_REQUEST", "上传文件格式不正确。", 400);
    const rawMetadata = form.get("metadata");
    if (typeof rawMetadata !== "string")
      return failure("BAD_REQUEST", "缺少照片信息。", 400);
    let metadata: unknown;
    try {
      metadata = JSON.parse(rawMetadata);
    } catch {
      return failure("BAD_REQUEST", "照片信息格式不正确。", 400);
    }
    const authorName = field(form, "authorName");
    const contactEmail = field(form, "contactEmail");
    const message = field(form, "message");
    const requestId = field(form, "submissionRequestId");
    const token = field(form, "turnstileToken");
    const consentAccepted = field(form, "consentAccepted") === "true";
    const result = await createSubmission({
      authorName,
      contactEmail,
      message,
      consentAccepted,
      submissionRequestId: requestId,
      turnstileToken: token,
      sourceKey: getSubmissionSourceKey(request),
      files: files.map((file, index) => ({
        file: file as File,
        metadata: Array.isArray(metadata) ? metadata[index] : undefined,
      })),
    });
    return Response.json(
      { success: true, data: result },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SubmissionSecurityError)
      return error.code === "ORIGIN"
        ? failure("FORBIDDEN", error.message, 403)
        : failure("SERVICE_UNAVAILABLE", error.message, 503);
    if (error instanceof SubmissionRateLimitError)
      return failure("RATE_LIMITED", error.message, 429, error.retryAfter);
    if (error instanceof TurnstileError)
      return error.code === "MISSING_CONFIG" || error.code === "UNAVAILABLE"
        ? failure("SERVICE_UNAVAILABLE", error.message, 503)
        : failure("TURNSTILE_INVALID", error.message, 422);
    if (error instanceof ImageValidationError)
      return error.code === "FILE_TOO_LARGE"
        ? failure("PAYLOAD_TOO_LARGE", error.message, 413)
        : error.code === "UNSUPPORTED_FORMAT"
          ? failure("UNSUPPORTED_MEDIA_TYPE", error.message, 415)
          : failure("INVALID_IMAGE", error.message, 422);
    if (error instanceof SubmissionError)
      return failure(
        error.code,
        error.message,
        error.code === "PAYLOAD_TOO_LARGE"
          ? 413
          : error.code === "RATE_LIMITED"
            ? 429
            : error.code === "DUPLICATE_REQUEST"
              ? 409
              : 422,
      );
    if (error instanceof StorageError)
      return failure(
        "STORAGE_UNAVAILABLE",
        "图片暂时无法保存，请稍后重试。",
        error.code === "TOO_LARGE" ? 413 : 503,
      );
    console.error(
      JSON.stringify({ event: "submission_failed", code: "INTERNAL_ERROR" }),
    );
    return failure("INTERNAL_ERROR", "投稿暂时无法完成，请稍后重试。", 500);
  }
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function failure(
  code: string,
  message: string,
  status: number,
  retryAfter?: number,
) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return Response.json({ error: { code, message } }, { status, headers });
}
