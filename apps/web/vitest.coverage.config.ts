import { defineConfig } from "vitest/config";
import { coverage } from "./vitest.config.ts";

// Unit and integration suites in one run, so coverage (and its thresholds) sees both.
export default defineConfig({
  test: {
    projects: ["./vitest.config.ts", "./vitest.int.config.ts"],
    coverage: { ...coverage, enabled: true },
  },
});
