import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.int.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // One database, so files run one at a time; each test cleans up after itself.
    fileParallelism: false,
  },
});
