import { signOut } from "@/server/auth/session-management.service";
import { clearedSessionCookie } from "@/server/auth/session.service";
import { authRequest, sessionOf, withApi } from "@/server/http/with-api";

/** Deletes the calling session, evicts it from the cache and expires the cookie (AC-9). */
export const POST = withApi({ allowUnverified: true }, async (ctx) => {
  await signOut(sessionOf(ctx), authRequest(ctx));
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearedSessionCookie() } });
});
