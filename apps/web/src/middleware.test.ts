import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

const run = (path: string, cookie?: string) =>
  middleware(
    new NextRequest(`http://localhost:3000${path}`, cookie ? { headers: { cookie } } : undefined),
  );

describe("middleware", () => {
  it.each([
    "/verify-email?token=abc",
    "/reset-password?token=abc",
    "/api/v1/auth/verify-email?token=abc",
  ])("keeps the token in %s out of the Referer", (path) => {
    expect(run(path).headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("uses the default referrer policy elsewhere", () => {
    expect(run("/signup").headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("sends signed-out visitors from the feed to /login with a return path", () => {
    const res = run("/explore?tab=top");
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/explore?tab=top");
  });

  it("lets sign-up and the email landing pages through without a session", () => {
    for (const path of ["/signup", "/check-inbox", "/verify-email"]) {
      expect(run(path).status).toBe(200);
    }
  });

  it("lets a visitor with a session cookie reach the feed", () => {
    expect(run("/", "ins.session_token=x").status).toBe(200);
  });
});
