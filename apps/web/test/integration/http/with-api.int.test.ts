import { AppError } from "@ins/shared/errors";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GET as ping, POST as pingPost } from "@/app/api/v1/ping/route";
import { logger } from "@/lib/logger";
import { ensureRedis, redis } from "@/lib/redis";
import type { SessionContext } from "@/server/auth/session.service";
import { withApi } from "@/server/http/with-api";

const session = vi.hoisted(() => ({ current: null as SessionContext | null }));
vi.mock("@/server/auth/session.service", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSession: async () => session.current,
}));

const ORIGIN = "http://localhost:3000";
/** Next always passes a context; routes without dynamic segments get no params. */
const NO_PARAMS = { params: Promise.resolve({}) };
let ipSeq = 0;
/** A fresh client IP per request builder keeps rate-limit buckets independent between tests. */
function client() {
  const ip = `10.0.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
  return (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
    new Request(`${ORIGIN}${path}`, {
      ...init,
      headers: { "x-forwarded-for": ip, ...init.headers },
    });
}

function user(overrides: Partial<SessionContext["user"]> = {}): SessionContext {
  return {
    sessionId: "s1",
    user: {
      id: crypto.randomUUID(),
      role: "USER",
      status: "ACTIVE",
      emailVerified: true,
      ...overrides,
    },
  };
}

beforeEach(async () => {
  session.current = null;
  await (await ensureRedis()).flushdb();
});

afterAll(async () => {
  await redis.quit();
});

describe("request context", () => {
  it("sets x-request-id and RateLimit headers on every response", async () => {
    const res = await ping(client()("/api/v1/ping"), NO_PARAMS);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("RateLimit-Limit")).toBe("60");
    expect(res.headers.get("RateLimit-Remaining")).toBe("59");
  });

  it("reuses a valid inbound request id", async () => {
    const res = await ping(
      client()("/api/v1/ping", { headers: { "x-request-id": "req-abcdef123" } }),
      NO_PARAMS,
    );
    expect(res.headers.get("x-request-id")).toBe("req-abcdef123");
    expect((await res.json()).requestId).toBe("req-abcdef123");
  });
});

describe("CSRF / Origin (AC-2)", () => {
  const handler = vi.fn(async () => ({ ok: true }));
  const route = withApi({ auth: "none" }, handler);

  beforeEach(() => handler.mockClear());

  it.each([{ origin: "https://evil.test" }, {}])(
    "rejects a POST with %j and never runs the handler",
    async (headers) => {
      const res = await route(client()("/api/v1/x", { method: "POST", headers }), NO_PARAMS);
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("FORBIDDEN");
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it("allows a POST from an allowed origin", async () => {
    const res = await route(
      client()("/api/v1/x", { method: "POST", headers: { origin: ORIGIN } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("exempts GET from the Origin check", async () => {
    const res = await route(
      client()("/api/v1/x", { headers: { origin: "https://evil.test" } }),
      NO_PARAMS,
    );
    expect(res.status).toBe(200);
  });
});

describe("validation (AC-3)", () => {
  const post = (body: string) =>
    pingPost(
      client()("/api/v1/ping", { method: "POST", body, headers: { origin: ORIGIN } }),
      NO_PARAMS,
    );

  it("returns 422 VALIDATION_FAILED with fieldErrors", async () => {
    const res = await post(JSON.stringify({ message: "", count: -1 }));
    expect(res.status).toBe(422);
    const { error } = await res.json();
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(error.details.fieldErrors).sort()).toEqual(["count", "message"]);
    expect(error.requestId).toBeTruthy();
  });

  it("rejects unknown keys", async () => {
    const res = await post(JSON.stringify({ message: "hi", count: 1, isAdmin: true }));
    expect(res.status).toBe(422);
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await post("{nope");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BAD_REQUEST");
  });

  it("passes parsed input to the handler", async () => {
    const res = await post(JSON.stringify({ message: "hi", count: 2 }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ echo: "hi", count: 2 });
  });

  it("validates route params", async () => {
    const route = withApi(
      { auth: "none", params: z.object({ id: z.uuid() }) },
      async (_c, { params }) => params,
    );
    const bad = await route(client()("/api/v1/x/1"), { params: Promise.resolve({ id: "1" }) });
    expect(bad.status).toBe(422);
    const id = crypto.randomUUID();
    const ok = await route(client()(`/api/v1/x/${id}`), { params: Promise.resolve({ id }) });
    expect(await ok.json()).toEqual({ id });
  });
});

describe("rate limits (AC-4)", () => {
  it("rejects the 61st search request in a minute with 429 and Retry-After", async () => {
    const req = client();
    for (let i = 0; i < 60; i++) {
      const res = await ping(req("/api/v1/ping"), NO_PARAMS);
      expect(res.status).toBe(200);
    }
    const res = await ping(req("/api/v1/ping"), NO_PARAMS);
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("RATE_LIMITED");
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(res.headers.get("RateLimit-Remaining")).toBe("0");
  });

  it("keys signed-in callers by user id, not IP", async () => {
    session.current = user();
    const route = withApi({ rateLimit: "export" }, async () => ({ ok: true }));
    expect((await route(client()("/api/v1/x"), NO_PARAMS)).status).toBe(200);
    // Different IP, same user: still limited.
    expect((await route(client()("/api/v1/x"), NO_PARAMS)).status).toBe(429);
  });
});

describe("authentication & authorization", () => {
  const route = withApi({}, async (ctx) => ({ id: ctx.session?.user.id }));

  it("401 without a session", async () => {
    const res = await route(client()("/api/v1/x"), NO_PARAMS);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("403 ACCOUNT_SUSPENDED", async () => {
    session.current = user({ status: "SUSPENDED" });
    expect((await (await route(client()("/api/v1/x"), NO_PARAMS)).json()).error.code).toBe(
      "ACCOUNT_SUSPENDED",
    );
  });

  it("403 EMAIL_NOT_VERIFIED unless the route allows it", async () => {
    session.current = user({ emailVerified: false });
    expect((await (await route(client()("/api/v1/x"), NO_PARAMS)).json()).error.code).toBe(
      "EMAIL_NOT_VERIFIED",
    );
    const me = withApi({ allowUnverified: true }, async () => ({ ok: true }));
    expect((await me(client()("/api/v1/me"), NO_PARAMS)).status).toBe(200);
  });

  it("403 FORBIDDEN when the role is missing", async () => {
    const admin = withApi({ roles: ["MODERATOR", "ADMIN"] }, async () => ({ ok: true }));
    session.current = user({ role: "USER" });
    expect((await admin(client()("/api/v1/admin"), NO_PARAMS)).status).toBe(403);
    session.current = user({ role: "MODERATOR" });
    expect((await admin(client()("/api/v1/admin"), NO_PARAMS)).status).toBe(200);
  });
});

describe("idempotency (AC-5)", () => {
  const post = (key: string) =>
    client()("/api/v1/posts", {
      method: "POST",
      headers: { origin: ORIGIN, "idempotency-key": key },
    });

  it("replays the stored response and runs the handler once", async () => {
    session.current = user();
    let n = 0;
    const route = withApi({ idempotent: true }, async () =>
      Response.json({ n: ++n }, { status: 201 }),
    );
    const key = crypto.randomUUID();
    const first = await route(post(key), NO_PARAMS);
    const second = await route(post(key), NO_PARAMS);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    expect(n).toBe(1);
  });

  it("scopes keys per user", async () => {
    let n = 0;
    const route = withApi({ idempotent: true }, async () => ({ n: ++n }));
    const key = crypto.randomUUID();
    session.current = user();
    await route(post(key), NO_PARAMS);
    session.current = user();
    await route(post(key), NO_PARAMS);
    expect(n).toBe(2);
  });

  it("409 CONFLICT for a concurrent duplicate", async () => {
    const me = user();
    session.current = me;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const route = withApi({ idempotent: true }, async () => {
      await gate;
      return { ok: true };
    });
    const key = crypto.randomUUID();
    const first = route(post(key), NO_PARAMS);
    await vi.waitFor(async () => expect(await redis.exists(`idem:${me.user.id}:${key}`)).toBe(1));
    const dup = await route(post(key), NO_PARAMS);
    expect(dup.status).toBe(409);
    release();
    expect((await first).status).toBe(200);
  });

  it("does not store failures, so the client can retry", async () => {
    session.current = user();
    let n = 0;
    const route = withApi({ idempotent: true }, async () => {
      if (++n === 1) throw new Error("transient");
      return { n };
    });
    const key = crypto.randomUUID();
    expect((await route(post(key), NO_PARAMS)).status).toBe(500);
    expect(await (await route(post(key), NO_PARAMS)).json()).toEqual({ n: 2 });
  });

  it("422 for a non-UUID key", async () => {
    session.current = user();
    const route = withApi({ idempotent: true }, async () => ({ ok: true }));
    expect((await route(post("abc"), NO_PARAMS)).status).toBe(422);
  });
});

describe("error mapping (AC-6)", () => {
  it("maps an AppError to its envelope", async () => {
    const res = await ping(client()("/api/v1/ping?fail=app"), NO_PARAMS);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { code: "CONFLICT", message: "Example conflict.", details: { reason: "demo" } },
    });
  });

  it("maps a plain Error to 500 INTERNAL, logs it and leaks nothing", async () => {
    const logged: unknown[][] = [];
    const realChild = logger.child.bind(logger);
    const spy = vi.spyOn(logger, "child").mockImplementation((...args) => {
      const child = realChild(...args);
      vi.spyOn(child, "error").mockImplementation((...a: unknown[]) => void logged.push(a));
      return child;
    });
    const res = await ping(client()("/api/v1/ping?fail=crash"), NO_PARAMS);
    spy.mockRestore();
    const text = await res.text();
    const body = JSON.parse(text);
    expect(res.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "INTERNAL",
        message: "Something went wrong.",
        requestId: res.headers.get("x-request-id"),
      },
    });
    expect(text).not.toMatch(/hunter2|secret|stack/);
    expect(logged).toHaveLength(1);
    expect((logged[0]?.[0] as { err: Error }).err.message).toContain("secret internal detail");
  });

  it("thrown AppError from a handler keeps request id", async () => {
    const route = withApi({ auth: "none" }, async () => {
      throw new AppError("NOT_FOUND", "Nope.");
    });
    const res = await route(
      client()("/api/v1/x", { headers: { "x-request-id": "req-zzzzzzzz" } }),
      NO_PARAMS,
    );
    expect((await res.json()).error.requestId).toBe("req-zzzzzzzz");
  });
});
