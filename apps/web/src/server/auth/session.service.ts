import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ensureRedis } from "@/lib/redis";
import { randomToken, sha256 } from "@/lib/crypto";
import type { Logger } from "@ins/shared/logger";
import { findSessionByTokenHash } from "./auth.repo";
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
}

/** Session cookie name; `__Secure-` needs HTTPS, so dev uses the bare name. */
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Secure-ins.session_token" : "ins.session_token";

/** spec/security, Session & token handling. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_TTL_S = 5 * 60;
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

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

interface CachedSession extends SessionContext {
  expiresAt: number;
}

/**
 * Resolves the caller's session from the cookie: SHA-256 of the token → Redis cache (5 min) →
 * `sessions` row. Expired sessions and deleted accounts resolve to null. A Redis outage falls
 * back to the database; revocation (INS-23) deletes the cache key.
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
  const session: CachedSession = {
    sessionId: row.id,
    user: row.user,
    expiresAt: row.expiresAt.getTime(),
  };
  await redis
    ?.set(cacheKey(tokenHash), JSON.stringify(session), "EX", CACHE_TTL_S)
    .catch((err: Error) => logger.warn({ err: err.message }, "session cache write failed"));
  return { sessionId: session.sessionId, user: session.user };
}
