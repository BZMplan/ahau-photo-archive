export interface AuthEnvironment {
  secret: string;
  baseURL: string;
  secureCookies: boolean;
}

// Shared by the runtime and official CLI. No secrets are printed or substituted.
export function readAuthEnvironment(
  env: Record<string, string | undefined> = process.env,
): AuthEnvironment {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.trim() !== secret) {
    throw new Error(
      "BETTER_AUTH_SECRET must be a randomly generated secret of at least 32 characters. See README.md.",
    );
  }
  if (!env.BETTER_AUTH_URL)
    throw new Error("BETTER_AUTH_URL is required. See README.md.");
  const url = new URL(env.BETTER_AUTH_URL);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
  ) {
    throw new Error(
      "BETTER_AUTH_URL must be an HTTPS origin, or an HTTP loopback origin for local development.",
    );
  }
  return {
    secret,
    baseURL: url.origin,
    secureCookies: url.protocol === "https:",
  };
}
