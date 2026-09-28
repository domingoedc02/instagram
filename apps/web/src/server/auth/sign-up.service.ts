import "server-only";
import { signUpAttemptMessage } from "@ins/email";
import { AppError } from "@ins/shared/errors";
import { hashPassword } from "@ins/shared/password";
import { isReservedUsername } from "@ins/shared/reserved-usernames";
import { MIN_AGE, type SignUpInput, ageOn } from "@ins/shared/schemas/auth";
import { defer } from "@/lib/defer";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/mailer";
import { createUserWithCredential, findUserByEmail, usernameExists } from "./auth.repo";
import { newVerificationToken, sendVerificationEmail } from "./email-verification.service";
import { isPasswordBreached } from "./hibp.service";
import type { AuthRequest } from "./session.service";

/** `GET /auth/username-available`. Reserved names are simply unavailable (AC-10). */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  if (isReservedUsername(username)) return false;
  return !(await usernameExists(username));
}

/**
 * UF-1 sign-up (INS-22). Order: age gate → HIBP → username → create. Returns nothing: the
 * route answers the same `200 {ok:true}` for a new and an existing email (AC-6), so both paths
 * do the same work up to the insert (including the Argon2 hash) and send mail after the response.
 */
export async function signUp(input: SignUpInput, req: AuthRequest): Promise<void> {
  if (ageOn(input.birthdate) < MIN_AGE) {
    // Nothing about the person is stored or logged (GDPR, brief/requirements).
    req.log.info({ event: "sign_up.underage" }, "sign-up rejected: age requirement");
    throw new AppError("AGE_REQUIREMENT_NOT_MET", "You must be at least 13 to use INS.");
  }

  if (env.HIBP_ENABLED && (await isPasswordBreached(input.password, { log: req.log }))) {
    throw new AppError(
      "PASSWORD_BREACHED",
      "This password has appeared in a data breach. Choose a different one.",
      { fieldErrors: { password: ["This password has appeared in a data breach."] } },
    );
  }

  if (!(await isUsernameAvailable(input.username))) throw usernameTaken();

  const passwordHash = await hashPassword(input.password);
  const verification = newVerificationToken();
  const result = await createUserWithCredential(
    {
      ...input,
      passwordHash,
      verification: { tokenHash: verification.tokenHash, expiresAt: verification.expiresAt },
    },
    req,
  );

  switch (result.kind) {
    case "created":
      sendVerificationEmail(input.email, input.name, verification.token, req);
      return;
    case "username_taken":
      throw usernameTaken();
    case "email_taken":
      notifyExistingOwner(input.email, req);
      return;
  }
}

function usernameTaken(): AppError {
  return new AppError("USERNAME_TAKEN", "This username is taken.", {
    fieldErrors: { username: ["This username is taken."] },
  });
}

function notifyExistingOwner(email: string, req: AuthRequest): void {
  defer(
    async () => {
      const owner = await findUserByEmail(email);
      if (!owner || owner.status === "DELETED") return;
      await sendEmail(
        await signUpAttemptMessage(email, {
          name: owner.name,
          loginUrl: new URL("/login", env.APP_URL).toString(),
          resetUrl: new URL("/reset-password", env.APP_URL).toString(),
        }),
      );
    },
    req.log,
    "email.sign_up_attempt",
  );
}
