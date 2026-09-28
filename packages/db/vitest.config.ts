import { configDefaults, defineConfig } from "vitest/config";

// Unit run: integration suites need a database and run via `pnpm test:int`.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "**/*.int.test.ts"] },
});
