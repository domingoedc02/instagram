import { revokeOtherSessions } from "@/server/auth/session-management.service";
import { authRequest, sessionOf, withApi } from "@/server/http/with-api";

/** "Log out all other sessions": every session but this one stops working at once (AC-10). */
export const POST = withApi({}, async (ctx) => ({
  revoked: await revokeOtherSessions(sessionOf(ctx), authRequest(ctx)),
}));
