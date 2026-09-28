import { describe, expect, it } from "vitest";
import { isReservedUsername } from "../reserved-usernames";
import { ageOn, maskEmail, signUpSchema, usernameSchema, safeNextPath, signInSchema } from "./auth";

const valid = {
  email: "  Maya@Example.com ",
  password: "correct horse battery",
  name: "Maya",
  username: "Maya.Creates",
  birthdate: "2000-02-29",
};

describe("signUpSchema", () => {
  it("normalises email and username to lowercase", () => {
    const out = signUpSchema.parse(valid);
    expect(out.email).toBe("maya@example.com");
    expect(out.username).toBe("maya.creates");
  });

  it.each([
    ["password too short", { password: "123456789" }],
    ["password too long", { password: "x".repeat(129) }],
    ["bad email", { email: "maya" }],
    ["email too long", { email: `${"a".repeat(250)}@x.io` }],
    ["bad date", { birthdate: "2000-13-01" }],
    ["future birthdate", { birthdate: "2999-01-01" }],
    ["empty name", { name: "  " }],
  ])("rejects %s", (_label, patch) => {
    expect(signUpSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("usernameSchema", () => {
  it.each(["ab", "a".repeat(31), "has space", "émile", ".maya", "maya.", "admin", "ADMIN", "api"])(
    "rejects %j",
    (u) => expect(usernameSchema.safeParse(u).success).toBe(false),
  );

  it.each(["maya", "leo_99", "a.b.c", "x".repeat(30)])("accepts %j", (u) =>
    expect(usernameSchema.safeParse(u).success).toBe(true),
  );

  it("treats the reserved list case-insensitively (AC-10)", () => {
    expect(isReservedUsername("Admin")).toBe(true);
    expect(isReservedUsername("maya")).toBe(false);
  });
});

describe("ageOn", () => {
  const today = new Date("2026-09-29T12:00:00Z");
  it("counts whole years", () => {
    expect(ageOn("2013-09-29", today)).toBe(13);
    expect(ageOn("2013-09-30", today)).toBe(12);
    expect(ageOn("2013-10-01", today)).toBe(12);
    expect(ageOn("2000-01-01", today)).toBe(26);
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("maya@example.com")).toBe("m***@example.com");
    expect(maskEmail("bad")).toBe("***");
  });
});

describe("signInSchema", () => {
  it("trims and lowercases the identifier", () => {
    expect(signInSchema.parse({ identifier: "  MaYa ", password: "x" })).toEqual({
      identifier: "maya",
      password: "x",
    });
  });

  it("does not apply the sign-up password rules", () => {
    expect(signInSchema.safeParse({ identifier: "maya", password: "short" }).success).toBe(true);
    expect(signInSchema.safeParse({ identifier: "maya", password: "" }).success).toBe(false);
    expect(signInSchema.safeParse({ identifier: " ", password: "x" }).success).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each(["/", "/explore", "/p/abc?x=1#y", "/settings/security"])("keeps %s", (next) => {
    expect(safeNextPath(next)).toBe(next);
  });

  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/\t/evil.test",
    "/\n/evil.test",
    "evil",
    "",
    undefined,
    ["/a"],
    `/${"a".repeat(2048)}`,
  ])("rejects %j", (next) => {
    expect(safeNextPath(next)).toBe("/");
  });
});
