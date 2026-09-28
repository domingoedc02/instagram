/**
 * Transactional email templates and the send adapter (Resend in production,
 * Mailpit over SMTP locally). Templates arrive with the auth stories (INS-22/24).
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailTemplate = "verify-email" | "reset-password" | "password-changed";

export { Layout } from "./components/layout";
