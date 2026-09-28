<!-- Title: Conventional Commit with the ORBIT key, e.g. `feat(posts): carousel upload (INS-42)`.
     It becomes the squash-merge commit. Keep the diff ≤ 400 changed lines (lockfiles excluded). -->

## What

## Why

<!-- ORBIT issue, and which acceptance criteria this PR satisfies. -->

Closes INS-

## How tested

<!-- One test per AC; list the commands you ran and anything verified by hand. -->

- [ ] `pnpm lint && pnpm typecheck && pnpm test`
- [ ] `pnpm test:int` / `pnpm test:coverage` (if server code changed)

## Screenshots (UI)

<!-- Mobile and desktop, light and dark. Delete for non-UI changes. -->

## Migration?

- [ ] No schema change
- [ ] New migration in `packages/db/prisma/migrations` (second reviewer: system-architect or team-lead)
  - Backwards compatible with the currently deployed app? Data backfill?

## Security impact

<!-- Touches auth, policy, moderation, privacy, uploads/presigning, realtime auth or PII?
     Then security-eng is the second reviewer. New dependency? Say why. -->

- [ ] None
- [ ] Yes, described below
