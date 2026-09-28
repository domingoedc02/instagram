import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("uses Argon2id with the OWASP parameters", async () => {
    const hashed = await hashPassword("password1234");
    expect(hashed).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it("verifies the right password and rejects a wrong one or a malformed hash", async () => {
    const hashed = await hashPassword("password1234");
    expect(await verifyPassword(hashed, "password1234")).toBe(true);
    expect(await verifyPassword(hashed, "password12345")).toBe(false);
    expect(await verifyPassword("not-a-hash", "password1234")).toBe(false);
  });
});
