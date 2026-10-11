const testSiteKeys = new Set([
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "3x00000000000000000000FF",
]);
const testSecretKeys = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

export function assertProductionTurnstileConfiguration(
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.NODE_ENV !== "production") return;
  const siteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const secretKey = env.TURNSTILE_SECRET_KEY;
  if (!siteKey || !secretKey)
    throw new Error(
      "Production Turnstile Site Key and Secret Key are required.",
    );
  if (testSiteKeys.has(siteKey) || testSecretKeys.has(secretKey))
    throw new Error("Production must not use Cloudflare Turnstile test keys.");
}
