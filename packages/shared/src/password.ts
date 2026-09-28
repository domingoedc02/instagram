import { hash, verify } from "@node-rs/argon2";

/** OWASP Password Storage Cheat Sheet, Argon2id minimum configuration (spec/security). */
// `algorithm: 2` is Algorithm.Argon2id; the package ships it as an ambient const enum, which
// verbatimModuleSyntax cannot import. The unit test asserts the resulting `$argon2id$` prefix.
export const ARGON2_PARAMS = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

/** Never throws on a malformed hash: a bad hash is simply not a match. */
export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}
