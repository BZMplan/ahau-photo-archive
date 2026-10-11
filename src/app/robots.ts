import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/archive", "/photo/", "/tags/"],
        disallow: ["/admin", "/api/"],
      },
    ],
    sitemap: base + "/sitemap.xml",
  };
}
