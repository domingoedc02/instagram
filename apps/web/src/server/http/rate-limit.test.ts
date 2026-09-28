import { createLogger } from "@ins/shared/logger";
import type { Redis } from "ioredis";
import { describe, expect, it } from "vitest";
import { POLICIES, rateLimit, rateLimitHeaders } from "./rate-limit";

const log = createLogger("test", { level: "silent" });
const down = { redis: () => Promise.reject(new Error("ECONNREFUSED")) as Promise<Redis>, log };

describe("rateLimit when Redis is unavailable", () => {
  it("fails open for general policies", async () => {
    const result = await rateLimit("search", "ip:1.2.3.4", down);
    expect(result.allowed).toBe(true);
  });

  it.each(["auth-sign-in", "auth-sign-up", "auth-forget-password"] as const)(
    "fails closed for %s",
    async (policy) => {
      const result = await rateLimit(policy, "ip:1.2.3.4", down);
      expect(result).toMatchObject({ allowed: false, remaining: 0 });
      expect(result.retryAfter).toBeGreaterThan(0);
    },
  );
});

describe("policies", () => {
  it("match spec/api", () => {
    expect(POLICIES.search).toEqual([{ limit: 60, windowMs: 60_000 }]);
    expect(POLICIES["auth-sign-in"]).toEqual([{ limit: 20, windowMs: 900_000 }]);
    expect(POLICIES.follows.map((w) => w.limit)).toEqual([100, 500]);
  });
});

describe("rateLimitHeaders", () => {
  it("adds Retry-After only when rejected", () => {
    expect(rateLimitHeaders({ allowed: true, limit: 60, remaining: 59, retryAfter: 0 })).toEqual({
      "RateLimit-Limit": "60",
      "RateLimit-Remaining": "59",
    });
    expect(
      rateLimitHeaders({ allowed: false, limit: 60, remaining: 0, retryAfter: 12 })["Retry-After"],
    ).toBe("12");
  });
});
