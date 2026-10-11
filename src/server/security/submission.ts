import "server-only";
import { createHmac } from "node:crypto";
import { readAuthEnvironment } from "@/server/auth/environment";

export function assertSubmissionOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let expected: string;
  try {
    expected = readAuthEnvironment().baseURL;
  } catch {
    throw new SubmissionSecurityError("CONFIGURATION");
  }
  if (origin !== expected) throw new SubmissionSecurityError("ORIGIN");
}

export function getSubmissionSourceKey(request: Request): string {
  const secret =
    process.env.RATE_LIMIT_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.trim() !== secret)
    throw new SubmissionSecurityError("CONFIGURATION");
  const trustedHeader = process.env.TRUSTED_PROXY_IP_HEADER?.trim();
  const source = trustedHeader
    ? request.headers.get(trustedHeader)?.trim() || "global"
    : "global";
  return createHmac("sha256", secret)
    .update(`anonymous-submission:${source}`)
    .digest("hex");
}

export class SubmissionSecurityError extends Error {
  constructor(readonly code: "ORIGIN" | "CONFIGURATION") {
    super(code === "ORIGIN" ? "请求来源不受信任。" : "投稿安全配置不完整。");
    this.name = "SubmissionSecurityError";
  }
}
