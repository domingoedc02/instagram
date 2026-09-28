import "server-only";
import { loginAlertMessage } from "@ins/email";
import { AppError } from "@ins/shared/errors";
import { hashPassword, verifyPassword } from "@ins/shared/password";
import type { SignInInput } from "@ins/shared/schemas/auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { defer } from "@/lib/defer";
import { env } from "@/lib/env";
import { truncateIp } from "@/lib/ip";
import { sendEmail } from "@/lib/mailer";
import { ensureRedis } from "@/lib/redis";
import { createSession, findSignInCandidate, writeAudit } from "./auth.repo";
import type { SignInCandidate } from "./auth.repo";
import { isSuspended, newSessionToken, sessionCookie } from "./session.service";
import type { AuthRequest } from "./session.service";

/** spec/security, Rate limiting & abuse: 5 failures in 15 minutes lock sign-in for 15 minutes. */
export const MAX_FAILURES = 5;
export const LOCK_TTL_S = 15 * 60;

const failKey = (id: string) => `fail:login:${id}`;
const lockKey = (id: string) => `lock:login:${id}`;
const userId = (id: string) => `u:${id}`;

// Verified against when the identifier matches no account, so both paths cost one Argon2 verify.
let dummyHash: Promise<string> | undefined;

export interface SignInResult {
  user: { id: string; username: string };
  setCookie: string;
}

/** Identical for every wrong password and every unknown identifier (AC-3). */
function invalidCredentials(): AppError {
  return new AppError("INVALID_CREDENTIALS", "Incorrect email, username or password.");
}

/** Identical for an identifier lock and an account lock, real or not (AC-4, AC-5). */
function locked(): AppError {
  return new AppError(
    "ACCOUNT_LOCKED",
    "Too many incorrect attempts. Try again in 15 minutes or reset your password.",
    { retryAfterSeconds: LOCK_TTL_S },
  );
}

/**
 * UF-2 sign-in (INS-23). Order matters for enumeration safety:
 * identifier lock (before any lookup) → lookup → Argon2 verify (a dummy one for unknown
 * identifiers) → account lock → failure accounting → status checks (only after a correct
 * password) → session.
 */
export async function signIn(input: SignInInput, req: AuthRequest): Promise<SignInResult> {
  const idHash = sha256(input.identifier);
  const redis = await ensureRedis();

  if (await redis.exists(lockKey(idHash))) throw locked();

  const candidate = await findSignInCandidate(
    input.identifier.includes("@") ? { email: input.identifier } : { username: input.identifier },
  );
  const user = candidate && candidate.status !== "DELETED" ? candidate : null;

  const matched = user?.passwordHash
    ? await verifyPassword(user.passwordHash, input.password)
    : await verifyPassword(await (dummyHash ??= hashPassword(randomToken())), input.password);

  if (user && (await redis.exists(lockKey(userId(user.id))))) throw locked();

  if (!user || !matched) {
    await recordFailure(idHash, user, req);
    throw invalidCredentials();
  }

  if (isSuspended(user.status, user.suspendedUntil)) {
    throw new AppError("ACCOUNT_SUSPENDED", "This account is suspended.", {
      until: user.suspendedUntil?.toISOString() ?? null,
    });
  }
  if (!user.emailVerified) {
    throw new AppError("EMAIL_NOT_VERIFIED", "Confirm your email to log in.");
  }

  const session = newSessionToken();
  await createSession(user.id, session, req);
  await redis.del(failKey(idHash), failKey(userId(user.id)));
  req.log.info({ userId: user.id }, "signed in");
  return {
    user: { id: user.id, username: user.username },
    setCookie: sessionCookie(session.token, session.expiresAt),
  };
}

/**
 * Counts a failure against the identifier hash and, for a real account, the account — so
 * switching between email and username cannot double the attempts (AC-6). The fifth failure on
 * either locks both; the owner is emailed once per lockout (the account lock is set with NX).
 */
async function recordFailure(
  idHash: string,
  user: SignInCandidate | null,
  req: AuthRequest,
): Promise<void> {
  const redis = await ensureRedis();
  const keys = user ? [idHash, userId(user.id)] : [idHash];

  const tx = redis.multi();
  for (const key of keys) tx.incr(failKey(key)).expire(failKey(key), LOCK_TTL_S, "NX");
  const replies = (await tx.exec()) ?? [];
  const counts = keys.map((_, i) => Number(replies[i * 2]?.[1] ?? 0));

  await writeAudit("auth.sign_in_failed", user?.id ?? null, req, {
    reason: user ? "bad_password" : "unknown_identifier",
  });

  if (Math.max(...counts) < MAX_FAILURES) return;

  const lockReplies = await Promise.all(
    keys.map((key) => redis.set(lockKey(key), "1", "EX", LOCK_TTL_S, "NX")),
  );
  if (!user || lockReplies[1] !== "OK") return;

  await writeAudit("auth.lockout", user.id, req, { failures: Math.max(...counts) });
  req.log.warn({ userId: user.id }, "sign-in locked");
  const { email, name } = user;
  defer(
    async () =>
      sendEmail(
        await loginAlertMessage(email, {
          name,
          when: new Date().toUTCString(),
          network: truncateIp(req.ip),
          resetUrl: new URL("/reset-password", env.APP_URL).toString(),
        }),
      ),
    req.log,
    "email.login_alert",
  );
}
