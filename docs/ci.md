# CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main` and `staging`.
A new push to a PR cancels that PR's previous run. Runs on `main` and `staging` always finish.

| Job                | Gate                                                                                                 | Local equivalent                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `setup-and-static` | `pnpm format:check`, `pnpm lint` (ESLint + architecture boundaries), `pnpm typecheck`                | same                                                                         |
| `unit`             | `pnpm test` (Vitest, every workspace)                                                                | same                                                                         |
| `integration`      | `@ins/db` integration tests, then `pnpm test:coverage` (web unit + integration, coverage thresholds) | `pnpm infra:up`, `pnpm test:int`, `pnpm test:coverage`                       |
| `migration-drift`  | `pnpm db:drift`: replays the migrations into a shadow DB and fails if `schema.prisma` differs        | same                                                                         |
| `security`         | gitleaks over the PR's commits (`.gitleaks.toml`) and `pnpm audit --prod --audit-level high`         | `docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:latest git /repo` |
| `build`            | `pnpm build` **without** a `.env`: the build must never need runtime secrets                         | `pnpm build`                                                                 |

`.github/workflows/codeql.yml` runs CodeQL (`security-extended`, javascript-typescript) on PRs, on `main` and weekly.

## Services

The integration and drift jobs start their services from `infra/docker-compose.dev.yml`, the same file `pnpm infra:up` uses:

- `postgres-test`: tmpfs-backed, with the `pg_uuidv7` image and the `ins_shadow` database from `infra/postgres/init.sql`
- `redis`
- `minio`, with buckets created by `minio-init`

This gives the same images, extensions and buckets as a laptop. `.github/ci.env` is copied to `.env` and holds throwaway values only. CI needs no repository secrets.

## Coverage (spec/testing)

Thresholds live in `apps/web/vitest.config.ts`:

- `src/server/**`: 80% lines
- `src/server/policy/**`: 100% branches

Server code is mostly exercised by the integration suite, so the thresholds are enforced by `pnpm test:coverage`, which runs both suites as Vitest projects in one process (`vitest.coverage.config.ts`). The lcov report is uploaded as the `coverage-web` artifact.

## Supply chain

- Every third-party action is pinned to a full commit SHA, with the version in a comment.
- Renovate (`renovate.json`) bumps the pins and groups npm minor and patch updates into one weekly PR. Majors wait for approval on the dependency dashboard.
- Workflows default to `permissions: contents: read`. Only CodeQL gets `security-events: write`, and only gitleaks gets `pull-requests: read`.
- No production credentials exist in any PR workflow. Deploy workflows arrive with the Vercel and Dokploy environments.

## Branch protection (repo admin applies once)

Settings → Branches → rule for `main`, and the same for `staging`:

1. **Require a pull request before merging**: 1 approval, dismiss stale approvals on new commits, and require review from Code Owners once `CODEOWNERS` exists.
2. **Require status checks to pass**, with branches up to date. Required checks:
   - `Lint, typecheck, format`
   - `Unit tests`
   - `Integration tests + coverage`
   - `Migration drift`
   - `Secret scan + dependency audit`
   - `Build`
   - `Analyze (javascript-typescript)`
3. **Require linear history**, and allow squash merging only (Settings → General → Pull Requests).
4. **Do not allow bypassing the above settings**. Block force pushes and deletions.

With the GitHub CLI, from a checkout, as an admin:

```sh
gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": [
    "Lint, typecheck, format", "Unit tests", "Integration tests + coverage", "Migration drift",
    "Secret scan + dependency audit", "Build", "Analyze (javascript-typescript)"
  ] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 1, "dismiss_stale_reviews": true },
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "restrictions": null
}
JSON
```
