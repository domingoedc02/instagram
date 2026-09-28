import "server-only";

export type Role = "USER" | "MODERATOR" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "PENDING_DELETION" | "DELETED";

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

/**
 * Resolves the caller's session. Stub until INS-22/INS-23 wire Better Auth (`auth.api.getSession`
 * with the Redis session cache); until then every request is anonymous.
 */
export async function getSession(_request: Request): Promise<SessionContext | null> {
  return null;
}
