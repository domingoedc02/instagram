import { render } from "@react-email/components";
import { createElement, type ReactElement } from "react";
import { LoginAlert, type LoginAlertProps } from "./templates/login-alert";
import { SignUpAttempt, type SignUpAttemptProps } from "./templates/sign-up-attempt";
import { VerifyEmail, type VerifyEmailProps } from "./templates/verify-email";

/**
 * Transactional email templates and the send adapter (Resend in production,
 * Mailpit over SMTP locally).
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailTemplate =
  "verify-email" | "sign-up-attempt" | "login-alert" | "reset-password" | "password-changed";

async function build(to: string, subject: string, element: ReactElement): Promise<EmailMessage> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { to, subject, html, text };
}

export function verifyEmailMessage(to: string, props: VerifyEmailProps): Promise<EmailMessage> {
  return build(to, "Confirm your email for INS", createElement(VerifyEmail, props));
}

export function signUpAttemptMessage(to: string, props: SignUpAttemptProps): Promise<EmailMessage> {
  return build(to, "Someone tried to sign up with your email", createElement(SignUpAttempt, props));
}

export function loginAlertMessage(to: string, props: LoginAlertProps): Promise<EmailMessage> {
  return build(to, "Unusual login attempts on your INS account", createElement(LoginAlert, props));
}

export { Layout } from "./components/layout";
export { createMailer, type Mailer, type MailerConfig } from "./transport";
