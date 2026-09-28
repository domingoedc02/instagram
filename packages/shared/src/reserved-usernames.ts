/**
 * Usernames nobody may claim: top-level routes (a profile lives at `/<username>`), staff-sounding
 * names and the brand (INS-22, spec/security Input validation). Compared lowercased.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  // Routes and route-like words
  "about",
  "accounts",
  "admin",
  "api",
  "app",
  "archive",
  "auth",
  "check-inbox",
  "create",
  "direct",
  "explore",
  "help",
  "highlights",
  "home",
  "legal",
  "login",
  "logout",
  "me",
  "messages",
  "new",
  "notifications",
  "p",
  "privacy",
  "reels",
  "reset",
  "reset-password",
  "saved",
  "search",
  "security",
  "settings",
  "signin",
  "signup",
  "static",
  "stories",
  "tags",
  "terms",
  "verify",
  "verify-email",
  "www",
  // Staff and system
  "administrator",
  "mod",
  "moderator",
  "moderators",
  "null",
  "official",
  "root",
  "staff",
  "support",
  "system",
  "team",
  "undefined",
  // Brand
  "ins",
  "ins.official",
  "instagram",
]);

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.toLowerCase());
}
