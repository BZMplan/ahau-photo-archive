import "server-only";

import { readAuthEnvironment } from "@/server/auth/environment";

export class TrustedOriginError extends Error {
  constructor() {
    super("请求来源不受信任。");
    this.name = "TrustedOriginError";
  }
}

export function assertTrustedOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let expected: string;
  try {
    expected = readAuthEnvironment().baseURL;
  } catch {
    throw new TrustedOriginError();
  }
  if (origin !== expected) throw new TrustedOriginError();
}
