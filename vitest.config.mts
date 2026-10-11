import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: [
      "tests/storage/**/*.test.ts",
      "tests/images/**/*.test.ts",
      "tests/submissions/**/*.test.ts",
      "tests/moderation/**/*.test.ts",
      "tests/public-gallery/**/*.test.ts",
      "tests/bootstrap/**/*.test.ts",
    ],
    setupFiles: ["./tests/vitest.setup.ts"],
    testTimeout: 20_000,
  },
});
