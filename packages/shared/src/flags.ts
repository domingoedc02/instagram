/**
 * Feature flags, read from `FLAG_<NAME>` environment variables ("1"/"true" = on).
 * Flags gate unfinished features in production; they are not a permission system.
 */
export const Flag = {
  Stories: "STORIES",
  Reels: "REELS",
  Dms: "DMS",
} as const;

export type Flag = (typeof Flag)[keyof typeof Flag];

export function isFlagOn(
  flag: Flag,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env[`FLAG_${flag}`]?.toLowerCase();
  return value === "1" || value === "true";
}
