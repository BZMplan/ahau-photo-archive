import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Sharp derivatives are already sized/encoded. Do not create a second image cache.
  images: {
    unoptimized: true,
    remotePatterns: [],
    localPatterns: [{ pathname: "/api/images/photos/**", search: "" }],
  },
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingExcludes: {
    "/*": [
      "./data/**/*",
      "./uploads/**/*",
      "./.env*",
      "./tests/**/*",
      "./.output/**/*",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
