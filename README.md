# INS

A production-grade photo & video sharing platform. Planned and tracked in ORBIT project **INS**
(handbook: INS-2).

## Quick start

```sh
corepack enable
pnpm install
pnpm dev          # web :3000, realtime :4001, worker
```

| Command          | What it does                              |
| ---------------- | ----------------------------------------- |
| `pnpm build`     | Build every app and package               |
| `pnpm lint`      | ESLint, including architecture boundaries |
| `pnpm typecheck` | Strict `tsc` across all workspaces        |
| `pnpm test`      | Unit tests (Vitest)                       |
| `pnpm format`    | Prettier                                  |

See `docs/adr/` for architecture decisions.
