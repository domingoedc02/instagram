# ADR-0002: Own the auth flows on Better Auth–shaped tables

- Status: Accepted
- Date: 2026-09-29
- Issue: INS-22 (applies to INS-23, INS-24)

## Context

spec/architecture names Better Auth for email + password. spec/security and the INS-22..24
stories then require things the library does not do the way we need:

- session tokens and verification/reset tokens stored **only as SHA-256 hashes**;
- an existing-email sign-up that is byte-for-byte indistinguishable from a new one, with the
  owner (not the requester) notified;
- a 13+ age gate and a HIBP k-anonymity check before anything is written;
- our own `/api/v1/auth/*` routes running through the shared pipeline (request id, origin
  check, rate-limit policies, zod validation, the error envelope, audit rows in the same
  transaction as the change).

Wrapping the library would mean overriding most of its handlers and hooks, and its storage
format would still decide how tokens are persisted.

## Decision

Implement the flows ourselves in `apps/web/src/server/auth/` on the schema Better Auth
defines (`users`, `accounts` with `providerId = "credential"`, `sessions`, `verifications`),
without the `better-auth` dependency:

- Passwords: argon2id via `@node-rs/argon2` (m=19456, t=2, p=1 — OWASP baseline).
- Sessions: 32 random bytes, base64url, in an `HttpOnly; SameSite=Lax` cookie
  (`__Secure-ins.session_token` in production); the row stores `sha256(token)`. 30-day TTL,
  resolved sessions cached in Redis for 5 minutes.
- Verification tokens: `verify:<userId>` identifiers, hashed values, 24 h, single use; issuing
  a new one deletes the old ones.

`BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` stay in the environment contract so that adopting the
library later (for OAuth or passkeys, both non-goals today) needs no data migration or env change.

## Consequences

- We own security-sensitive code, so it has to be tested accordingly. The integration suite covers
  every INS-22 acceptance criterion against real Postgres and Redis, and src/server is held to
  the spec/testing coverage gate.
- The tables stay compatible with Better Auth, so switching later is a code change only.
- Rate-limit policy and audit names use the codebase's separators (`auth-sign-up`,
  `auth.sign_up`) rather than the story's `auth-signup` / `auth.signup`.
