import "server-only";
import { readAuthEnvironment } from "@/server/auth/environment";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const EXPECTED_ACTION = "submit";
export type TurnstileFailure =
  "MISSING_TOKEN" | "MISSING_CONFIG" | "INVALID" | "UNAVAILABLE";
export interface TurnstileVerification {
  success: boolean;
  errorCodes: string[];
  hostname?: string;
  action?: string;
  failure?: TurnstileFailure;
}
interface SiteverifyResponse {
  success?: unknown;
  "error-codes"?: unknown;
  hostname?: unknown;
  action?: unknown;
}
export class TurnstileError extends Error {
  constructor(readonly code: TurnstileFailure) {
    super(
      code === "MISSING_TOKEN"
        ? "请完成安全验证。"
        : code === "MISSING_CONFIG"
          ? "投稿验证服务尚未配置。"
          : code === "UNAVAILABLE"
            ? "投稿验证服务暂时不可用，请稍后重试。"
            : "安全验证未通过，请重新验证。",
    );
    this.name = "TurnstileError";
  }
}
export interface TurnstileOptions {
  fetchImpl?: typeof fetch;
  expectedHostname?: string;
  expectedAction?: string;
}
export async function verifyTurnstile(
  token: string,
  options: TurnstileOptions = {},
): Promise<TurnstileVerification> {
  if (!token.trim()) throw new TurnstileError("MISSING_TOKEN");
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || secret.trim() !== secret)
    throw new TurnstileError("MISSING_CONFIG");
  let expectedHostname = options.expectedHostname;
  if (!expectedHostname) {
    try {
      expectedHostname = new URL(readAuthEnvironment().baseURL).hostname;
    } catch {
      throw new TurnstileError("MISSING_CONFIG");
    }
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = new URLSearchParams({ secret, response: token });
  let response: Response;
  try {
    response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TurnstileError("UNAVAILABLE");
  }
  if (!response.ok) throw new TurnstileError("UNAVAILABLE");
  let result: SiteverifyResponse;
  try {
    result = (await response.json()) as SiteverifyResponse;
  } catch {
    throw new TurnstileError("UNAVAILABLE");
  }
  const success = result.success === true;
  const hostname =
    typeof result.hostname === "string" ? result.hostname : undefined;
  const action = typeof result.action === "string" ? result.action : undefined;
  const errorCodes = Array.isArray(result["error-codes"])
    ? result["error-codes"].filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const expectedAction = options.expectedAction ?? EXPECTED_ACTION;
  if (!success || hostname !== expectedHostname || action !== expectedAction)
    return { success: false, errorCodes, hostname, action, failure: "INVALID" };
  return { success: true, errorCodes, hostname, action };
}
