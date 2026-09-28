import { AppError } from "@ins/shared/errors";
import { z } from "zod";
import { revokeSession } from "@/server/auth/session-management.service";
import { clearedSessionCookie } from "@/server/auth/session.service";
import { authRequest, sessionOf, withApi } from "@/server/http/with-api";

/** Revokes one of the caller's sessions; anyone else's id is 404 (AC-12). */
export const DELETE = withApi(
  { params: z.object({ id: z.string().max(64) }) },
  async (ctx, { params }) => {
    const session = sessionOf(ctx);
    const revoked = await revokeSession(session, params.id, authRequest(ctx));
    if (!revoked) throw new AppError("NOT_FOUND", "Session not found.");
    // Revoking this device's own session is a sign-out.
    const headers: HeadersInit =
      params.id === session.sessionId ? { "Set-Cookie": clearedSessionCookie() } : {};
    return new Response(null, { status: 204, headers });
  },
);
