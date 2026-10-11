import "server-only";
import { FeatureNotImplementedError } from "@/server/errors";

export interface TurnstileVerification {
  success: boolean;
  errorCodes: string[];
}

export async function verifyTurnstile(
  token: string,
): Promise<TurnstileVerification> {
  void token;
  throw new FeatureNotImplementedError("Turnstile server-side verification");
}
