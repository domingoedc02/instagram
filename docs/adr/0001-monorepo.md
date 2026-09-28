# ADR-0001: pnpm + Turborepo monorepo

- Status: Accepted
- Date: 2026-09-29
- Issue: INS-17

## Context

INS ships three deployables — the Next.js web app (Vercel), the BullMQ worker and the
Socket.IO realtime server (both Dokploy) — that share the Prisma client, zod schemas, error
codes, event names and email templates. They must evolve in lockstep: an API shape change
has to update the web client, worker and realtime handler in one reviewable change.

## Decision

One repository, managed with **pnpm workspaces** and **Turborepo**:

- `apps/web`, `apps/worker`, `apps/realtime` — deployables. Apps never import each other.
- `packages/db` (the only Prisma instantiation), `packages/shared` (zod-only contracts,
  errors, events, flags, logger), `packages/email`, `packages/config` (ESLint, tsconfig,
  Tailwind theme).
- Internal packages ship **TypeScript source**; Next.js compiles them via
  `transpilePackages` and the Node apps bundle them with `tsup` (`noExternal: [/^@ins\//]`).
  No per-package build step, no stale `dist/`.
- Architecture boundaries from spec/file-structure are enforced in CI by
  `eslint-plugin-boundaries` (v7 `boundaries/dependencies` policies).
- TypeScript is pinned to 5.9 until `typescript-eslint` supports 6+.
- Tailwind 4 themes are CSS-first, so the "preset" is `packages/config/tailwind-preset.css`
  imported by each app's stylesheet rather than a `tailwind-preset.ts`.

## Consequences

- One lockfile, one CI pipeline, atomic cross-cutting changes.
- Turborepo caches `build`/`lint`/`typecheck`/`test` per workspace; CI runs only affected work.
- Vercel builds `apps/web` with the repo root as install root; Dokploy builds the worker and
  realtime Dockerfiles from the repo root.
- Contributors need Node 22 (`.nvmrc`) and `corepack enable` for pnpm 9.
