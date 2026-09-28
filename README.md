# INS

A production-grade photo & video sharing platform. Planned and tracked in ORBIT project **INS**
(handbook: INS-2).

## Quick start

```sh
corepack enable
pnpm install
cp .env.example .env   # then fill BETTER_AUTH_SECRET and REALTIME_JWT_SECRET
pnpm infra:up          # Postgres, PgBouncer, Redis, MinIO, Mailpit (+ bucket setup)
pnpm dev               # web :3000, realtime :4001, worker
```

Every app validates its environment at boot and refuses to start with a list of what is
missing or malformed (`apps/*/src/lib/env.ts`).

| Service         | Host port | Notes                                      |
| --------------- | --------- | ------------------------------------------ |
| Postgres        | 5432      | Direct connection, migrations only         |
| Postgres (test) | 5433      | tmpfs, for `pnpm test:int`                 |
| PgBouncer       | 6432      | App traffic (`DATABASE_URL`)               |
| Redis           | 6379      |                                            |
| MinIO           | 9000/9001 | API / console (minio / minio12345)         |
| Mailpit         | 1025/8025 | SMTP / web UI — every dev email lands here |

A taken host port can be moved with the `INS_*_PORT` variables in `.env` (see `.env.example`).

| Command           | What it does                              |
| ----------------- | ----------------------------------------- |
| `pnpm build`      | Build every app and package               |
| `pnpm lint`       | ESLint, including architecture boundaries |
| `pnpm typecheck`  | Strict `tsc` across all workspaces        |
| `pnpm test`       | Unit tests (Vitest)                       |
| `pnpm format`     | Prettier                                  |
| `pnpm infra:up`   | Start local services and wait for health  |
| `pnpm infra:down` | Stop them (volumes kept)                  |
| `pnpm infra:logs` | Tail service logs                         |

See `docs/adr/` for architecture decisions.
