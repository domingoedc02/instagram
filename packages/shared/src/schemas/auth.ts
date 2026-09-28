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
