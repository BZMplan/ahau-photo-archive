import "server-only";

import { getPublicImageUrl } from "./urls";

export type CachePurgeResult =
  | { status: "purged" }
  | { status: "not_configured"; reason: "missing_credentials" }
  | { status: "failed"; reason: "network" | "rejected" };

/**
 * Purges only the affected image URLs when a Cloudflare zone token is configured.
 * A missing token is explicit so operators do not mistake database invalidation
 * for immediate CDN invalidation.
 */
export async function purgePublicImageUrls(
  keys: string[],
): Promise<CachePurgeResult> {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
  const token = process.env.CLOUDFLARE_CACHE_PURGE_TOKEN?.trim();
  if (!zoneId || !token)
    return { status: "not_configured", reason: "missing_credentials" };
  const urls = keys.map((key) => getPublicImageUrl(key));
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: urls }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) return { status: "failed", reason: "rejected" };
    const body: unknown = await response.json().catch(() => null);
    if (!isCloudflareSuccess(body))
      return { status: "failed", reason: "rejected" };
    return { status: "purged" };
  } catch {
    return { status: "failed", reason: "network" };
  }
}

function isCloudflareSuccess(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { success?: unknown }).success === true
  );
}
