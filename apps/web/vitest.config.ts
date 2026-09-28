import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import type { CoverageOptions } from "vitest/node";

/**
 * spec/testing thresholds. Server code is mostly exercised by the integration suite, so they
 * are enforced by `pnpm test:coverage` (vitest.coverage.config.ts), which runs both suites.
 */
export const coverage: CoverageOptions = {
  provider: "v8",
  include: ["src/server/**/*.ts"],
  exclude: ["**/*.test.ts"],
  reporter: ["text-summary", "lcov"],
  thresholds: {
    "src/server/**": { lines: 80 },
    "src/server/policy/**": { branches: 100 },
  },
};

export default defineConfig({
  resolve: {
    alias: {
      "@/": fileURLToPath(new URL("./src/", import.meta.url)),
      // `server-only` throws outside the react-server condition; tests are server code.
      "server-only": fileURLToPath(new URL("./test/stubs/empty.ts", import.meta.url)),
    },
  },
  test: {
    name: "unit",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
