import { defineConfig } from "vitest/config";
import base from "./vitest.config.ts";

// Standalone rather than mergeConfig: merging would concatenate the unit `include` too.
export default defineConfig({
  resolve: base.resolve,
  test: {
    include: ["test/integration/**/*.int.test.ts"],
    environment: "node",
    fileParallelism: false,
    setupFiles: ["test/integration/setup.ts"],
  },
});
