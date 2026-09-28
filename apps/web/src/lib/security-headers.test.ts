import { describe, expect, it } from "vitest";
import { buildCsp, cspSourcesFromEnv, resolveRequestId } from "./security-headers";

const prod = cspSourcesFromEnv({
  NODE_ENV: "production",
  NEXT_PUBLIC_MEDIA_BASE_URL: "https://media.ins.app/ins-media",
  S3_PUBLIC_ENDPOINT: "https://s3.ins.app",
  NEXT_PUBLIC_REALTIME_URL: "wss://rt.ins.app",
});

describe("buildCsp", () => {
  it("matches spec/security in production", () => {
    expect(buildCsp("abc", prod)).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'nonce-abc' 'strict-dynamic'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' https://media.ins.app data: blob:",
        "media-src 'self' https://media.ins.app blob:",
        "connect-src 'self' https://s3.ins.app wss://rt.ins.app https://*.ingest.sentry.io",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join("; "),
    );
  });

  it("never allows unsafe-eval outside development", () => {
    expect(buildCsp("n", prod)).not.toContain("unsafe-eval");
    expect(buildCsp("n", { ...prod, dev: true })).toContain("'unsafe-eval'");
  });

  it("skips unparseable origins instead of emitting them", () => {
    const src = cspSourcesFromEnv({ NEXT_PUBLIC_MEDIA_BASE_URL: "not a url" });
    expect(buildCsp("n", src)).toContain("img-src 'self' data: blob:");
  });
});

describe("resolveRequestId", () => {
  it("reuses a well-formed inbound id", () => {
    expect(resolveRequestId("iad1::abcde-1234")).toBe("iad1::abcde-1234");
  });

  it.each([null, "", "short", "has spaces in it", "x".repeat(129), "<script>alert(1)</script>"])(
    "mints a new id for %j",
    (inbound) => {
      expect(resolveRequestId(inbound)).toMatch(/^[0-9a-f-]{36}$/);
    },
  );
});
