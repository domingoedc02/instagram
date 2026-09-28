import "server-only";
import { truncateIp } from "@/lib/ip";
import { describeDevice } from "@/lib/user-agent";
import { deleteSessions, listSessions } from "./auth.repo";
import { evictSessions } from "./session.service";
import type { AuthRequest, SessionContext } from "./session.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SessionItem {
  id: string;
  device: string;
  /** /24 or /48 — the full address is only in audit_logs. */
  ip: string;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

/** `GET /me/sessions` (INS-23, flow step 12). */
export async function listMySessions(session: SessionContext): Promise<SessionItem[]> {
  const rows = await listSessions(session.user.id, new Date());
  return rows.map((row) => ({
    id: row.id,
    device: describeDevice(row.userAgent),
    ip: truncateIp(row.ipAddress),
    createdAt: row.createdAt.toISOString(),
    lastActiveAt: row.updatedAt.toISOString(),
    current: row.id === session.sessionId,
  }));
}

/** `POST /auth/sign-out`: the row goes, then the cache entry, so the token dies at once (AC-9). */
export async function signOut(session: SessionContext, req: AuthRequest): Promise<void> {
  const tokens = await deleteSessions(
    session.user.id,
    { only: session.sessionId },
    "auth.sign_out",
    req,
  );
  await evictSessions(tokens ?? [], req.log);
}

/**
 * `DELETE /me/sessions/:id`. False when the id is not one of the caller's sessions — the route
 * answers 404 either way, so another user's session ids are not confirmed (AC-12).
 */
export async function revokeSession(
  session: SessionContext,
  sessionId: string,
  req: AuthRequest,
): Promise<boolean> {
  if (!UUID.test(sessionId)) return false;
  const tokens = await deleteSessions(
    session.user.id,
    { only: sessionId },
    "auth.sessions_revoked",
    req,
  );
  if (!tokens) return false;
  await evictSessions(tokens, req.log);
  return true;
}

/** `POST /me/sessions/revoke-others`: everything but the calling session (AC-10). */
export async function revokeOtherSessions(
  session: SessionContext,
  req: AuthRequest,
): Promise<number> {
  const tokens = await deleteSessions(
    session.user.id,
    { except: session.sessionId },
    "auth.sessions_revoked",
    req,
  );
  await evictSessions(tokens ?? [], req.log);
  return tokens?.length ?? 0;
}
