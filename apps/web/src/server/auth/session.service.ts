import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ensureRedis } from "@/lib/redis";
import { randomToken, sha256 } from "@/lib/crypto";
import type { Logger } from "@ins/shared/logger";
import { findSessionByTokenHash, touchSession } from "./auth.repo";
import type { AuditMeta } from "./auth.repo";

export type Role = "USER" | "MODERATOR" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "PENDING_DELETION" | "DELETED";

/** What an auth service needs from the request: audit facts plus the request logger. */
export interface AuthRequest extends AuditMeta {
  log: Logger;
}

export interface SessionUser {
  id: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
}

export interface SessionContext {
  sessionId: string;
  user: SessionUser;
  /** Set when the expiry just slid forward: the pipeline re-sends the cookie with it. */
  renewedCookie?: string;
}

/** Session cookie name; `__Secure-` needs HTTPS, so dev uses the bare name. */
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Secure-ins.session_token" : "ins.session_token";

/** spec/security, Session & token handling. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Revocation evicts the cache; the TTL bounds staleness of anything else (status changes). */
const CACHE_TTL_S = 60;
/** Rolling expiry is refreshed at most this often (INS-23, Security). */
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
/** `updated_at` (lastActiveAt) is written at most this often, not on every request. */
const TOUCH_AFTER_MS = 60 * 60 * 1000;
const cacheKey = (tokenHash: string) => `sess:${tokenHash}`;

/** A new session secret: the cookie carries `token`, the database only its SHA-256. */
export function newSessionToken(now: Date = new Date()) {
  const token = randomToken();
  return { token, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + SESSION_TTL_MS) };
}

/** `Set-Cookie` value for a session: HttpOnly, SameSite=Lax, Path=/, Secure in production. */
export function sessionCookie(token: string, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/** Expires the session cookie (sign-out, or a cookie that no longer resolves). */
export function clearedSessionCookie(): string {
  return sessionCookie("", new Date(0));
}

/** A suspension with a `suspendedUntil` in the past has lapsed (null means indefinite). */
export function isSuspended(status: UserStatus, suspendedUntil: Date | null, now = new Date()) {
  return status === "SUSPENDED" && (suspendedUntil === null || suspendedUntil > now);
}

/** Whether the request carries a session cookie at all (resolvable or not). */
export function hasSessionCookie(request: Request): boolean {
  return readCookie(request.headers.get("cookie"), SESSION_COOKIE) !== null;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

interface CachedSession {
  sessionId: string;
  user: SessionUser;
  expiresAt: number;
  updatedAt: number;
}

/**
 * Resolves the caller's session from the cookie: SHA-256 of the token → Redis cache (60 s) →
 * `sessions` row. Expired sessions and deleted accounts resolve to null; a lapsed suspension
 * reads as ACTIVE. A Redis outage falls back to the database; revocation evicts the cache key.
 *
 * On a database read the session is touched (lastActiveAt, hourly) and, once a day, its expiry
 * slides to now + 30 days; `renewedCookie` then carries the new Max-Age for the response.
 */
export async function getSession(request: Request): Promise<SessionContext | null> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token || token.length > 128) return null;
  const tokenHash = sha256(token);
  const now = Date.now();

  const redis = await ensureRedis().catch(() => null);
  const cached = await redis?.get(cacheKey(tokenHash)).catch(() => null);
  if (cached) {
    const hit = JSON.parse(cached) as CachedSession;
    if (hit.expiresAt > now) return { sessionId: hit.sessionId, user: hit.user };
  }

  const row = await findSessionByTokenHash(tokenHash);
  if (!row || row.expiresAt.getTime() <= now || row.user.status === "DELETED") return null;

  const { suspendedUntil, ...user } = row.user;
  const effective: SessionUser = {
    ...user,
    status:
      user.status === "SUSPENDED" && !isSuspended(user.status, suspendedUntil, new Date(now))
        ? "ACTIVE"
        : user.status,
  };

  let expiresAt = row.expiresAt.getTime();
  let updatedAt = row.updatedAt.getTime();
  let renewedCookie: string | undefined;
  const refresh = expiresAt - now < SESSION_TTL_MS - REFRESH_AFTER_MS;
  if (refresh || now - updatedAt > TOUCH_AFTER_MS) {
    const next = refresh ? new Date(now + SESSION_TTL_MS) : undefined;
    try {
      await touchSession(row.id, next);
      updatedAt = now;
      if (next) {
        expiresAt = next.getTime();
        renewedCookie = sessionCookie(token, next);
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "session touch failed",
      );
    }
  }

  const session: CachedSession = { sessionId: row.id, user: effective, expiresAt, updatedAt };
  await redis
    ?.set(cacheKey(tokenHash), JSON.stringify(session), "EX", CACHE_TTL_S)
    .catch((err: Error) => logger.warn({ err: err.message }, "session cache write failed"));
  return {
    sessionId: session.sessionId,
    user: session.user,
    ...(renewedCookie ? { renewedCookie } : {}),
  };
}

/**
 * Drops revoked sessions from the cache so they stop working at once, not after the TTL. A
 * Redis failure here is logged loudly: the 60 s TTL is then the upper bound.
 */
export async function evictSessions(tokenHashes: string[], log: Logger): Promise<void> {
  if (tokenHashes.length === 0) return;
  try {
    const redis = await ensureRedis();
    await redis.del(...tokenHashes.map(cacheKey));
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err), count: tokenHashes.length },
      "session cache eviction failed",
    );
  }
}
