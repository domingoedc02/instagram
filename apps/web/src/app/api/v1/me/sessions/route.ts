import { listMySessions } from "@/server/auth/session-management.service";
import { sessionOf, withApi } from "@/server/http/with-api";

/** The caller's live sessions for /settings/security. */
export const GET = withApi({}, async (ctx) => ({ items: await listMySessions(sessionOf(ctx)) }));
