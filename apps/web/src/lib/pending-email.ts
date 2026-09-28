/**
 * The address a visitor just signed up with, kept in sessionStorage so the check-inbox page can
 * offer "resend" without putting the full email in the URL (it only carries the masked form).
 */
const KEY = "ins.pendingEmail";

export function rememberPendingEmail(email: string): void {
  try {
    sessionStorage.setItem(KEY, email);
  } catch {
    // Storage can be unavailable (private mode, blocked); the page then asks for the email.
  }
}

export function readPendingEmail(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
