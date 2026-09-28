import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

const h = (init: Record<string, string>) => new Headers(init);

describe("clientIp", () => {
  it("prefers the platform headers", () => {
    expect(clientIp(h({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }), true)).toBe(
      "1.1.1.1",
    );
    expect(clientIp(h({ "x-vercel-forwarded-for": "2.2.2.2, 3.3.3.3" }), true)).toBe("2.2.2.2");
  });

  it("ignores client-controllable x-forwarded-for on Vercel", () => {
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6" }), true)).toBe("unknown");
  });

  it("uses the first x-forwarded-for hop off Vercel", () => {
    expect(clientIp(h({ "x-forwarded-for": "4.4.4.4, 10.0.0.1" }), false)).toBe("4.4.4.4");
  });

  it("falls back to unknown", () => {
    expect(clientIp(h({}), false)).toBe("unknown");
  });
});
