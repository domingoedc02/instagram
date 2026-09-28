import { z } from "zod";
import { isReservedUsername } from "../reserved-usernames";

/** Minimum age at sign-up (brief/requirements, GDPR-grade). */
export const MIN_AGE = 13;

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email({ message: "Enter a valid email address." }))
  .transform((e) => e.toLowerCase());

/** `^[a-z0-9._]{3,30}$`, lowercased, no leading/trailing dot, not reserved (spec/security). */
export const usernameSchema = z
  .string()
  .trim()
  .transform((u) => u.toLowerCase())
  .pipe(
    z
      .string()
      .regex(/^[a-z0-9._]{3,30}$/, "3–30 characters: letters, numbers, periods and underscores.")
      .refine((u) => !u.startsWith(".") && !u.endsWith("."), "Can't start or end with a period.")
      .refine((u) => !isReservedUsername(u), "This username isn't available."),
  );

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use at most 128 characters.");

/** A real calendar date, `YYYY-MM-DD`, not in the future. */
export const birthdateSchema = z.iso
  .date({ message: "Enter your birthdate." })
  .refine((d) => d <= new Date().toISOString().slice(0, 10), "Birthdate can't be in the future.");

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1, "Enter your name.").max(64),
  username: usernameSchema,
  birthdate: birthdateSchema,
});
export type SignUpInput = z.output<typeof signUpSchema>;

export const resendVerificationSchema = z.object({ email: emailSchema });

/**
 * `POST /auth/sign-in` (INS-23). The identifier is an email when it contains `@`, otherwise a
 * username; both are normalized (trim, lowercase). The password is not held to the sign-up
 * rules — a wrong one must get the generic 401, not a validation error.
 */
export const signInSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Enter your email or username.")
    .max(254)
    .transform((i) => i.toLowerCase()),
  password: z.string().min(1, "Enter your password.").max(128),
});
export type SignInInput = z.output<typeof signInSchema>;

/**
 * The post-login destination: only a same-origin relative path (`/…`, not `//…` or `/\…`,
 * which browsers treat as another host) — anything else is `/` (open-redirect guard, AC-11).
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  // Control characters (tab, newline) are stripped by URL parsers and can smuggle a `//`.
  if ([...next].some((c) => c.charCodeAt(0) < 0x20 || c === "\u007f") || next.length > 2048) {
    return "/";
  }
  return next;
}

export const usernameAvailableQuery = z.object({ u: z.string().max(64) });

/** Whole years between `birthdate` (YYYY-MM-DD) and `today`, in UTC. */
export function ageOn(birthdate: string, today: Date = new Date()): number {
  const [y, m, d] = birthdate.split("-").map(Number) as [number, number, number];
  let age = today.getUTCFullYear() - y;
  const month = today.getUTCMonth() + 1;
  if (month < m || (month === m && today.getUTCDate() < d)) age -= 1;
  return age;
}

/** `maya@example.com` → `m***@example.com`, for the check-inbox URL (no full email in URLs). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
