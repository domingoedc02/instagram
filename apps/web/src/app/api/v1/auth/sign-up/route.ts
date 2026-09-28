import { signUpSchema } from "@ins/shared/schemas/auth";
import { signUp } from "@/server/auth/sign-up.service";
import { withApi } from "@/server/http/with-api";

/**
 * UF-1 sign-up. Always `200 {ok:true}` without a cookie on success — new and existing emails
 * are indistinguishable (INS-22 AC-6); the session is minted at verification.
 */
export const POST = withApi(
  { auth: "none", rateLimit: "auth-sign-up", body: signUpSchema },
  async (ctx, { body }) => {
    await signUp(body, {
      ip: ctx.ip,
      userAgent: ctx.request.headers.get("user-agent"),
      requestId: ctx.requestId,
      log: ctx.log,
    });
    return { ok: true };
  },
);
