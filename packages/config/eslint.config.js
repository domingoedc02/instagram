// Shared ESLint flat config. Each workspace re-exports `config(...)` with its own options.
import { createRequire } from "node:module";
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import boundaries from "eslint-plugin-boundaries";
import globals from "globals";
import tseslint from "typescript-eslint";

const repoRoot = new URL("../..", import.meta.url).pathname;
// Resolved from here so every workspace finds it, whatever its cwd.
const tsResolver = createRequire(import.meta.url).resolve("eslint-import-resolver-typescript");

/**
 * Architecture boundaries from spec/file-structure. v7 elements are folders (first
 * match wins, anchored at the repo root); individual files are classified by category.
 */
const elements = [
  { type: "web-app", pattern: "apps/web/src/app" },
  { type: "web-components", pattern: "apps/web/src/components" },
  { type: "web-hooks", pattern: "apps/web/src/hooks" },
  { type: "web-http", pattern: "apps/web/src/server/http" },
  { type: "web-policy", pattern: "apps/web/src/server/policy" },
  { type: "web-module", pattern: "apps/web/src/server/*", capture: ["module"] },
  { type: "web-lib", pattern: "apps/web/src/lib" },
  { type: "web-root", pattern: "apps/web/src" },
  { type: "web-e2e", pattern: "apps/web/e2e" },
  { type: "web-test", pattern: "apps/web/test" },
  { type: "worker", pattern: "apps/worker" },
  { type: "realtime", pattern: "apps/realtime" },
  { type: "pkg-db", pattern: "packages/db" },
  { type: "pkg-shared", pattern: "packages/shared" },
  { type: "pkg-email", pattern: "packages/email" },
  { type: "pkg-ui", pattern: "packages/ui" },
  { type: "pkg-config", pattern: "packages/config" },
].map((el) => ({ ...el, partialMatch: false }));

const files = [
  { category: "service", pattern: "**/*.service.ts" },
  { category: "repo", pattern: "**/*.repo.ts" },
  { category: "test", pattern: "**/*.test.{ts,tsx}" },
];

const packages = ["pkg-shared", "pkg-email", "pkg-ui"];

const types = (/** @type {string[]} */ list) => ({ element: { types: { anyOf: list } } });
const allow = (/** @type {object} */ from, /** @type {object} */ to) => ({ from, allow: { to } });
const el = (/** @type {string} */ type) => ({ element: { type } });
const service = { element: { type: "web-module" }, file: { categories: "service" } };
const repo = { element: { type: "web-module" }, file: { categories: "repo" } };
const sameModule = {
  element: { type: "web-module", captured: { module: "{{ from.element.captured.module }}" } },
};

const policies = [
  // Third-party and Node built-ins are governed by package.json, not by boundaries.
  { allow: { to: { module: { origin: "!local" } } } },
  // Routes and pages reach the server layer through services and http, never repos/Prisma.
  allow(
    el("web-app"),
    types([
      "web-app",
      "web-components",
      "web-hooks",
      "web-http",
      "web-policy",
      "web-lib",
      ...packages,
    ]),
  ),
  allow(el("web-app"), service),
  // UI never reaches into server code.
  allow(el("web-components"), types(["web-components", "web-hooks", "web-lib", ...packages])),
  allow(el("web-hooks"), types(["web-hooks", "web-lib", ...packages])),
  allow(el("web-http"), types(["web-http", "web-policy", "web-lib", ...packages])),
  allow(el("web-http"), service),
  allow(el("web-policy"), types(["web-policy", "web-lib", "pkg-shared"])),
  // Services call other services, policy and lib — and only their own module's repo.
  allow(
    { element: { type: "web-module" }, file: { categories: "!repo" } },
    types(["web-policy", "web-lib", ...packages]),
  ),
  allow({ element: { type: "web-module" }, file: { categories: "!repo" } }, service),
  allow({ element: { type: "web-module" }, file: { categories: "!repo" } }, sameModule),
  // Repos hold Prisma and nothing else.
  allow(repo, types(["pkg-db", "pkg-shared"])),
  allow(el("web-lib"), types(["web-lib", ...packages])),
  allow(el("web-root"), types(["web-lib", "pkg-shared"])),
  allow(el("web-e2e"), types(["web-e2e", "pkg-shared"])),
  // Integration tests drive the app from outside and may reach any layer.
  allow(
    el("web-test"),
    types([
      "web-test",
      "web-app",
      "web-http",
      "web-policy",
      "web-module",
      "web-lib",
      "pkg-db",
      ...packages,
    ]),
  ),
  // Apps never import each other.
  allow(el("worker"), types(["worker", "pkg-db", ...packages])),
  allow(el("realtime"), types(["realtime", "pkg-db", "pkg-shared"])),
  allow(el("pkg-db"), types(["pkg-db", "pkg-shared"])),
  // shared never depends on another workspace.
  allow(el("pkg-shared"), types(["pkg-shared"])),
  allow(el("pkg-email"), types(["pkg-email", "pkg-shared"])),
  allow(el("pkg-ui"), types(["pkg-ui", "pkg-shared"])),
  allow(el("pkg-config"), types(["pkg-config"])),
];

/**
 * @param {{ next?: boolean, rootDir: string }} options
 */
export function config({ next = false, rootDir }) {
  return tseslint.config(
    {
      ignores: [
        "**/dist/**",
        "**/.next/**",
        "**/coverage/**",
        "**/next-env.d.ts",
        "**/*.config.{js,mjs,cjs}",
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.strict,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: { tsconfigRootDir: rootDir },
      },
      rules: {
        "no-console": "error",
        "no-restricted-syntax": [
          "error",
          {
            selector: "MemberExpression[property.name=/^\\$(queryRawUnsafe|executeRawUnsafe)$/]",
            message:
              "Use tagged $queryRaw / $executeRaw — the Unsafe variants allow SQL injection.",
          },
        ],
        "@typescript-eslint/consistent-type-imports": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
      },
    },
    {
      plugins: { boundaries },
      settings: {
        "boundaries/root-path": repoRoot,
        "boundaries/elements": elements,
        "boundaries/files": files,
        "boundaries/include": ["apps/**/*", "packages/**/*"],
        "import/resolver": {
          [tsResolver]: {
            alwaysTryTypes: true,
            project: `${rootDir}/tsconfig.json`,
          },
        },
      },
      rules: {
        "boundaries/dependencies": ["error", { default: "disallow", policies }],
      },
    },
    ...(next
      ? [
          {
            plugins: { "@next/next": nextPlugin },
            languageOptions: { globals: { ...globals.browser } },
            rules: {
              ...nextPlugin.configs.recommended.rules,
              ...nextPlugin.configs["core-web-vitals"].rules,
            },
          },
        ]
      : []),
  );
}
