import { env } from "@/lib/env";
import { verifyEmail } from "@/server/auth/email-verification.service";
import { withApi } from "@/server/http/with-api";

/**
 * The link in the verification email lands on /verify-email, which forwards here. Success
 * sets the session cookie and redirects to `/`; anything else to `/verify-email?status=invalid`.
 * The token never appears in logs (withApi logs the path only) or in a Referer.
 */
export const GET = withApi({ auth: "none", rateLimit: "auth-verify-email" }, async (ctx) => {
  const token = new URL(ctx.request.url).searchParams.get("token") ?? "";
  const result = await verifyEmail(token, {
    ip: ctx.ip,
    userAgent: ctx.request.headers.get("user-agent"),
    requestId: ctx.requestId,
    log: ctx.log,
  });
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    Location: new URL(result.ok ? "/" : "/verify-email?status=invalid", env.APP_URL).toString(),
  });
  if (result.ok) headers.set("Set-Cookie", result.setCookie);
  return new Response(null, { status: 302, headers });
});
