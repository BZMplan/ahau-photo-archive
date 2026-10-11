import type { MetadataRoute } from "next";
import { listPublishedPhotoIds } from "@/server/services/public-photos";

export const dynamic = "force-dynamic";

function origin() {
  return process.env.BETTER_AUTH_URL || "http://localhost:3000";
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = origin().replace(/\/$/, "");
  return [
    { url: base + "/" },
    { url: base + "/archive" },
    ...listPublishedPhotoIds().map((id) => ({
      url: base + "/photo/" + id,
    })),
  ];
}
