# INS

A production-grade photo & video sharing platform. Planned and tracked in ORBIT project **INS**
(handbook: INS-2).

## Quick start

```sh
corepack enable
pnpm install
cp .env.example .env   # then fill BETTER_AUTH_SECRET and REALTIME_JWT_SECRET
pnpm infra:up          # Postgres, PgBouncer, Redis, MinIO, Mailpit (+ bucket setup)
pnpm db:migrate        # apply migrations (packages/db/prisma/migrations)
pnpm db:seed           # maya, leo, ana (private), sam (moderator), admin — password1234
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

### Database

| Command              | What it does                                                      |
| -------------------- | ----------------------------------------------------------------- |
| `pnpm db:migrate`    | `prisma migrate dev` — create/apply migrations locally            |
| `pnpm db:deploy`     | `prisma migrate deploy` — what CI runs against production         |
| `pnpm db:seed`       | Idempotent dev seed; refuses when `NODE_ENV=production`           |
| `pnpm db:drift`      | Exits non-zero when `schema.prisma` has changes no migration has  |
| `pnpm db:studio`     | Prisma Studio                                                     |
| `pnpm test:int`      | Integration tests against the tmpfs test database (:5433)         |
| `pnpm test:coverage` | Web unit + integration tests with the spec/testing coverage gates |

Never edit a migration that has been applied anywhere; add a new one. Constraints Prisma cannot
express (CHECKs, expression and partial indexes) are hand-written at the end of `migration.sql`;
declare every other index in `schema.prisma`, or `migrate dev` will generate a DROP for it.

CI (`.github/workflows/ci.yml`) runs the same commands on every PR; see [docs/ci.md](docs/ci.md)
for the jobs, the coverage gates and branch protection.

### API routes

Every `/api/v1` handler is wrapped in `withApi()` (`apps/web/src/server/http/with-api.ts`), which
runs, in order: request context → rate limit → Origin check → authenticate → validate (strict
zod) → authorize → idempotency → handler → error envelope.

```ts
export const POST = withApi(
  { rateLimit: "posts", body: createPostSchema, idempotent: true },
  async (ctx, { body }) =>
    Response.json(await createPost(ctx.session!.user.id, body), { status: 201 }),
);
```

Throw `AppError` from `@ins/shared/errors` for expected failures; anything else becomes a
500 `INTERNAL` with only the request id. Rate-limit policies live in `server/http/rate-limit.ts`.
`GET /api/v1/ping` (dev only) exercises the pipeline; `?fail=app|crash` shows the error mapping.

See `docs/adr/` for architecture decisions.
