import "server-only";
import { type EmailMessage, type Mailer, createMailer } from "@ins/email";
import { env } from "./env";

let mailer: Mailer | undefined;

/** Resend in production, Mailpit over SMTP locally (spec/setup). Built on first send. */
export async function sendEmail(message: EmailMessage): Promise<void> {
  mailer ??= createMailer({
    from: env.EMAIL_FROM,
    resendApiKey: env.RESEND_API_KEY,
    smtpUrl: env.SMTP_URL,
  });
  await mailer.send(message);
}
