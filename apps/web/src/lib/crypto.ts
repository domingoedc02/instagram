import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes, base64url — session and email tokens (spec/security). */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hex SHA-256. Tokens are stored and looked up by this, never in the clear. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
