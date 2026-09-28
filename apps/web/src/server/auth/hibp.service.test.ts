import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isPasswordBreached } from "./hibp.service";

const log = { warn: vi.fn() } as unknown as Parameters<typeof isPasswordBreached>[1]["log"];
const sha1 = (s: string) => createHash("sha1").update(s).digest("hex").toUpperCase();

function rangeApi(body: string, status = 200) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) => new Response(body, { status }),
  );
}

describe("isPasswordBreached", () => {
  const digest = sha1("password1234");

  it("sends only the 5-char prefix, with padding requested", async () => {
    const fetch = rangeApi("");
    await isPasswordBreached("password1234", { log, fetch });

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`);
    expect(url).not.toContain(digest.slice(5));
    expect(new Headers(init.headers).get("Add-Padding")).toBe("true");
  });

  it("reports a suffix with a positive count as breached", async () => {
    const fetch = rangeApi(
      `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${digest.slice(5)}:9545824\r\n`,
    );
    expect(await isPasswordBreached("password1234", { log, fetch })).toBe(true);
  });

  it("treats a padding entry (count 0) as clean", async () => {
    const fetch = rangeApi(`${digest.slice(5)}:0`);
    expect(await isPasswordBreached("password1234", { log, fetch })).toBe(false);
  });

  it("returns false when the suffix is absent", async () => {
    const fetch = rangeApi("0018A45C4D1DEF81644B54AB7F969B88D65:1");
    expect(await isPasswordBreached("password1234", { log, fetch })).toBe(false);
  });

  it.each([
    ["an error status", rangeApi("", 503)],
    ["a network error", vi.fn(async () => Promise.reject(new Error("ECONNRESET")))],
  ])("fails open and warns on %s", async (_label, fetch) => {
    const warn = vi.fn();
    const result = await isPasswordBreached("x", { log: { ...log, warn } as typeof log, fetch });
    expect(result).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("fails open after the timeout", async () => {
    const fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    );
    expect(await isPasswordBreached("x", { log, fetch, timeoutMs: 20 })).toBe(false);
  });
});
