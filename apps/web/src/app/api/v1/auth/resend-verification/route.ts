import { AppError } from "@ins/shared/errors";
import { resendVerificationSchema } from "@ins/shared/schemas/auth";
import { sha256 } from "@/lib/crypto";
import { ensureRedis } from "@/lib/redis";
import { resendVerification } from "@/server/auth/email-verification.service";
import { withApi } from "@/server/http/with-api";
import { rateLimit } from "@/server/http/rate-limit";

/** Unauthenticated and always 204 (INS-22 AC-9). 10/h per IP (withApi) and 3/h per email. */
export const POST = withApi(
  { auth: "none", rateLimit: "auth-resend-verification", body: resendVerificationSchema },
  async (ctx, { body }) => {
    const perEmail = await rateLimit("auth-resend-verification-email", `e:${sha256(body.email)}`, {
      redis: ensureRedis,
      log: ctx.log,
    });
    if (!perEmail.allowed) throw new AppError("RATE_LIMITED", "Too many requests.");
    await resendVerification(body.email, {
      ip: ctx.ip,
      userAgent: ctx.request.headers.get("user-agent"),
      requestId: ctx.requestId,
      log: ctx.log,
    });
    return undefined;
  },
);
