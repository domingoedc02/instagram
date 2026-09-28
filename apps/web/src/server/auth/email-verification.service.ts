import "server-only";
import { verifyEmailMessage } from "@ins/email";
import { randomToken, sha256 } from "@/lib/crypto";
import { defer } from "@/lib/defer";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/mailer";
import { consumeVerificationToken, findUserByEmail, replaceVerificationToken } from "./auth.repo";
import { newSessionToken, sessionCookie } from "./session.service";
import type { AuthRequest } from "./session.service";

export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/** A single-use email token: the link carries `token`, `verifications.value` its SHA-256. */
export function newVerificationToken(now: Date = new Date()) {
  const token = randomToken();
  return {
    token,
    tokenHash: sha256(token),
    expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
  };
}

export function verificationUrl(token: string): string {
  const url = new URL("/verify-email", env.APP_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

/** Sends the verification email after the response (no timing signal, INS-22 NFR). */
export function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
  req: AuthRequest,
): void {
  defer(
    async () => sendEmail(await verifyEmailMessage(to, { name, url: verificationUrl(token) })),
    req.log,
    "email.verify",
  );
}

/**
 * `POST /auth/resend-verification`. Issues and sends a new token only for an unverified, active
 * account; the caller answers 204 whatever happens (AC-9). The new token invalidates the old.
 */
export async function resendVerification(email: string, req: AuthRequest): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user || user.emailVerified || user.status !== "ACTIVE") return;
  const { token, tokenHash, expiresAt } = newVerificationToken();
  await replaceVerificationToken(user.id, tokenHash, expiresAt);
  sendVerificationEmail(email, user.name, token, req);
}

export type VerifyEmailResult = { ok: true; setCookie: string } | { ok: false };

/**
 * `GET /auth/verify-email`. A valid token verifies the email and mints the session (the only
 * place sign-up creates one — Revision 2 of INS-22). Anything else changes nothing (AC-7).
 */
export async function verifyEmail(token: string, req: AuthRequest): Promise<VerifyEmailResult> {
  if (token.length < 20 || token.length > 128) return { ok: false };
  const now = new Date();
  const session = newSessionToken(now);
  const verified = await consumeVerificationToken(sha256(token), now, session, req);
  if (!verified) {
    req.log.info("verification token rejected");
    return { ok: false };
  }
  req.log.info({ userId: verified.userId }, "email verified");
  return { ok: true, setCookie: sessionCookie(session.token, session.expiresAt) };
}
