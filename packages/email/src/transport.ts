import { createTransport } from "nodemailer";
import type { EmailMessage } from "./index";

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

export interface MailerConfig {
  from: string;
  /** Production: sends through the Resend HTTP API. */
  resendApiKey?: string | undefined;
  /** Everywhere else: an SMTP sink such as Mailpit (`smtp://localhost:1025`). */
  smtpUrl?: string | undefined;
  fetch?: typeof fetch;
}

const RESEND_URL = "https://api.resend.com/emails";

/** Resend when a key is configured, else SMTP. `requireMailTransport` guarantees one exists. */
export function createMailer(config: MailerConfig): Mailer {
  if (config.resendApiKey) {
    const key = config.resendApiKey;
    const doFetch = config.fetch ?? fetch;
    return {
      async send(message) {
        const res = await doFetch(RESEND_URL, {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({ from: config.from, ...message }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`Resend responded ${res.status}`);
      },
    };
  }
  if (!config.smtpUrl) throw new Error("No mail transport: set RESEND_API_KEY or SMTP_URL");
  const smtp = createTransport(config.smtpUrl);
  return {
    async send(message) {
      await smtp.sendMail({ from: config.from, ...message });
    },
  };
}
