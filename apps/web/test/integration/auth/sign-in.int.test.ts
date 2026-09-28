import { createHash } from "node:crypto";
import type { EmailMessage } from "@ins/email";
import { createUser, testDb, truncate } from "@ins/db/test";
import { hashPassword } from "@ins/shared/password";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as signIn } from "@/app/api/v1/auth/sign-in/route";
import { POST as signOut } from "@/app/api/v1/auth/sign-out/route";
import { DELETE as deleteSession } from "@/app/api/v1/me/sessions/[id]/route";
import { POST as revokeOthers } from "@/app/api/v1/me/sessions/revoke-others/route";
import { GET as listSessions } from "@/app/api/v1/me/sessions/route";
import { settleDeferred } from "@/lib/defer";
import { ensureRedis, redis } from "@/lib/redis";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/server/auth/session.service";

const outbox = vi.hoisted(() => [] as EmailMessage[]);
vi.mock("@/lib/mailer", () => ({
  sendEmail: async (message: EmailMessage) => {
    outbox.push(message);
  },
}));

const db = testDb();
const ORIGIN = "http://localhost:3000";
const NO_PARAMS = { params: Promise.resolve({}) };
const PASSWORD = "a long unique passphrase";
const UA_A =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const UA_B = "Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0";
let ipSeq = 0;
const freshIp = () => `10.2.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let passwordHash: string;

interface Opts {
  ip?: string;
  cookie?: string;
  ua?: string;
}

function request(method: string, path: string, body: unknown, opts: Opts = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      "x-forwarded-for": opts.ip ?? freshIp(),
      "user-agent": opts.ua ?? UA_A,
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const login = (identifier: string, password = PASSWORD, opts: Opts = {}) =>
  signIn(request("POST", "/api/v1/auth/sign-in", { identifier, password }, opts), NO_PARAMS);

const sessions = (cookie: string) =>
  listSessions(request("GET", "/api/v1/me/sessions", undefined, { cookie }), NO_PARAMS);

/** `name=value` from a Set-Cookie header, for the next request's Cookie header. */
function cookieOf(res: Response): string {
  const header = res.headers.get("set-cookie");
  if (!header) throw new Error("no Set-Cookie");
  return header.split(";")[0] as string;
}
const tokenOf = (cookie: string) => cookie.slice(SESSION_COOKIE.length + 1);

/** The error body without its per-request id, for byte-for-byte comparisons. */
async function errorBody(res: Response) {
  const body = (await res.json()) as { error: Record<string, unknown> };
  const { requestId, ...rest } = body.error;
  expect(requestId).toEqual(expect.any(String));
  return rest;
}

async function member(overrides: Parameters<typeof createUser>[1] = {}) {
  const user = await createUser(db, overrides);
  await db.account.create({
    data: { userId: user.id, accountId: user.id, providerId: "credential", password: passwordHash },
  });
  return user;
}

async function mailTo(email: string): Promise<EmailMessage[]> {
  await settleDeferred();
  return outbox.filter((m) => m.to === email);
}

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
  await truncate(db, "users", "sessions", "audit_logs");
});

beforeEach(async () => {
  outbox.length = 0;
  await (await ensureRedis()).flushdb();
});

afterAll(async () => {
  await truncate(db, "users", "sessions", "audit_logs");
  await Promise.all([db.$disconnect(), redis.quit()]);
});

describe("POST /api/v1/auth/sign-in", () => {
  it("AC-1 signs a verified user in by email with an HttpOnly, SameSite=Lax session cookie", async () => {
    const user = await member();
    const res = await login(`  ${user.email.toUpperCase()} `, PASSWORD, { ip: "203.0.113.7" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { id: user.id, username: user.username } });
    expect(res.headers.get("cache-control")).toBe("no-store");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE.replace(".", "\\.")}=[\\w-]{43};`));
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toMatch(/Max-Age=259(19\d\d|2000)\b/);

    const rows = await db.session.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ipAddress: "203.0.113.7", userAgent: UA_A });
    expect(await db.auditLog.count({ where: { actorId: user.id, action: "auth.sign_in" } })).toBe(
      1,
    );

    // The cookie authenticates.
    expect((await sessions(cookieOf(res))).status).toBe(200);
  });

  it("AC-2 accepts the username in any case", async () => {
    const user = await member({ username: "maya_ac2" });
    const res = await login("MaYa_AC2");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { id: user.id, username: "maya_ac2" } });
  });

  it("AC-3 answers a wrong password and an unknown identifier identically", async () => {
    const user = await member();
    const wrong = await login(user.email, "not the password");
    const unknown = await login("nobody@test.local", "not the password");
    const unknownName = await login("nobody_here", "not the password");

    expect([wrong.status, unknown.status, unknownName.status]).toEqual([401, 401, 401]);
    const bodies = await Promise.all([wrong, unknown, unknownName].map(errorBody));
    expect(bodies[0]).toEqual({
      code: "INVALID_CREDENTIALS",
      message: "Incorrect email, username or password.",
    });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(wrong.headers.get("set-cookie")).toBeNull();

    expect(
      await db.auditLog.findMany({
        where: { action: "auth.sign_in_failed", actorId: user.id },
        select: { meta: true },
      }),
    ).toEqual([{ meta: { reason: "bad_password" } }]);
    expect(
      await db.auditLog.count({ where: { action: "auth.sign_in_failed", actorId: null } }),
    ).toBeGreaterThanOrEqual(2);
  });

  it("AC-4 locks the account after 5 failures, even for the right password, and alerts once", async () => {
    const user = await member();
    for (let i = 0; i < 5; i++) expect((await login(user.email, "wrong")).status).toBe(401);

    const sixth = await login(user.email);
    expect(sixth.status).toBe(423);
    expect(await errorBody(sixth)).toEqual({
      code: "ACCOUNT_LOCKED",
      message: "Too many incorrect attempts. Try again in 15 minutes or reset your password.",
      details: { retryAfterSeconds: 900 },
    });
    expect(await login(user.email)).toHaveProperty("status", 423);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);

    const mail = await mailTo(user.email);
    expect(mail).toHaveLength(1);
    expect(mail[0]?.subject).toBe("Unusual login attempts on your INS account");
    expect(mail[0]?.text).toMatch(/10\.2\.\d+\.0\/24/);
    expect(await db.auditLog.count({ where: { actorId: user.id, action: "auth.lockout" } })).toBe(
      1,
    );
    const ttl = await redis.ttl(`lock:login:u:${user.id}`);
    expect(ttl).toBeGreaterThan(890);
    expect(ttl).toBeLessThanOrEqual(900);
  });

  it("AC-5 locks an unknown email exactly like a real account", async () => {
    const real = await member();
    for (let i = 0; i < 5; i++) await login(real.email, "wrong");
    const realLocked = await errorBody(await login(real.email));

    for (let i = 0; i < 5; i++) {
      expect((await login("ghost@test.local", "wrong")).status).toBe(401);
    }
    const ghost = await login("ghost@test.local");
    expect(ghost.status).toBe(423);
    expect(await errorBody(ghost)).toEqual(realLocked);
    expect(outbox.filter((m) => m.to === "ghost@test.local")).toHaveLength(0);
  });

  it("AC-6 counts failures per account across email and username", async () => {
    const user = await member();
    for (let i = 0; i < 3; i++) expect((await login(user.email, "wrong")).status).toBe(401);
    for (let i = 0; i < 2; i++) expect((await login(user.username, "wrong")).status).toBe(401);

    expect((await login(user.email)).status).toBe(423);
    expect((await login(user.username)).status).toBe(423);
    expect(await mailTo(user.email)).toHaveLength(1);
  });

  it("clears the failure counters on success", async () => {
    const user = await member();
    for (let i = 0; i < 4; i++) await login(user.email, "wrong");
    expect((await login(user.email)).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login(user.email, "wrong")).status).toBe(401);
    expect((await login(user.email)).status).toBe(200);
  });

  it("AC-7 refuses a suspended account after a correct password, with the until-date", async () => {
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const user = await member({ status: "SUSPENDED", suspendedUntil: until });

    const res = await login(user.email);
    expect(res.status).toBe(403);
    expect(await errorBody(res)).toEqual({
      code: "ACCOUNT_SUSPENDED",
      message: "This account is suspended.",
      details: { until: until.toISOString() },
    });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);

    // Status errors only follow a correct password.
    expect((await login(user.email, "wrong")).status).toBe(401);

    const indefinite = await member({ status: "SUSPENDED", suspendedUntil: null });
    const res2 = await login(indefinite.email);
    expect((await errorBody(res2)).details).toEqual({ until: null });
  });

  it("lets a user whose suspension has lapsed sign in and use the API", async () => {
    const user = await member({
      status: "SUSPENDED",
      suspendedUntil: new Date(Date.now() - 60_000),
    });
    const res = await login(user.email);
    expect(res.status).toBe(200);
    expect((await sessions(cookieOf(res))).status).toBe(200);
  });

  it("AC-8 refuses an unverified account after a correct password; a wrong one is 401", async () => {
    const user = await member({ emailVerified: false });
    const res = await login(user.email);
    expect(res.status).toBe(403);
    expect((await errorBody(res)).code).toBe("EMAIL_NOT_VERIFIED");
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await login(user.email, "wrong")).status).toBe(401);
  });

  it("lets an account pending deletion sign in", async () => {
    const user = await member({ status: "PENDING_DELETION" });
    expect((await login(user.email)).status).toBe(200);
  });

  it("treats a deleted account as unknown", async () => {
    const user = await member({ status: "DELETED" });
    const res = await login(user.email);
    expect(res.status).toBe(401);
    expect((await errorBody(res)).code).toBe("INVALID_CREDENTIALS");
  });

  it("limits sign-in to 20 attempts per 15 minutes per IP", async () => {
    const ip = "198.51.100.20";
    for (let i = 0; i < 20; i++) {
      expect((await login(`ip_user_${i}@test.local`, "wrong", { ip })).status).toBe(401);
    }
    const res = await login("another@test.local", "wrong", { ip });
    expect(res.status).toBe(429);
    expect((await errorBody(res)).code).toBe("RATE_LIMITED");
  });

  it("rejects unknown keys and an empty identifier", async () => {
    const extra = await signIn(
      request("POST", "/api/v1/auth/sign-in", { identifier: "a", password: "b", admin: true }),
      NO_PARAMS,
    );
    expect(extra.status).toBe(422);
    expect((await login("   ", "x")).status).toBe(422);
  });

  it("AC-13 stores only the SHA-256 of the cookie token", async () => {
    const user = await member();
    const token = tokenOf(cookieOf(await login(user.email)));
    const row = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.token).not.toBe(token);
    expect(row.token).toBe(sha256(token));
    expect(await db.session.count({ where: { token } })).toBe(0);
  });
});

describe("POST /api/v1/auth/sign-out", () => {
  it("AC-9 deletes the session, expires the cookie, and the old cookie stops working", async () => {
    const user = await member();
    const cookie = cookieOf(await login(user.email));
    // Warm the session cache, so eviction (not just the row delete) is what is tested.
    expect((await sessions(cookie)).status).toBe(200);

    const res = await signOut(request("POST", "/api/v1/auth/sign-out", {}, { cookie }), NO_PARAMS);
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { actorId: user.id, action: "auth.sign_out" } })).toBe(
      1,
    );

    const after = await sessions(cookie);
    expect(after.status).toBe(401);
    // The dead cookie is expired so the middleware stops treating the browser as signed in.
    expect(after.headers.get("set-cookie")).toMatch(new RegExp(`^${SESSION_COOKIE}=;.*Max-Age=0`));
  });

  it("requires a session", async () => {
    const res = await signOut(request("POST", "/api/v1/auth/sign-out", {}), NO_PARAMS);
    expect(res.status).toBe(401);
  });
});

describe("/api/v1/me/sessions", () => {
  it("lists the caller's sessions with device, truncated IP and the current marker", async () => {
    const user = await member();
    const a = cookieOf(await login(user.email, PASSWORD, { ip: "203.0.113.57", ua: UA_A }));
    await login(user.email, PASSWORD, { ip: "2001:db8:85a3:8d3::1", ua: UA_B });
    await login((await member()).email); // someone else's

    const res = await sessions(a);
    const { items } = (await res.json()) as { items: Record<string, unknown>[] };
    expect(items).toHaveLength(2);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ device: "Chrome on macOS", ip: "203.0.113.0/24", current: true }),
        expect.objectContaining({
          device: "Firefox on Linux",
          ip: "2001:db8:85a3::/48",
          current: false,
        }),
      ]),
    );
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(
        ["createdAt", "current", "device", "id", "ip", "lastActiveAt"].sort(),
      );
    }
  });

  it("AC-10 revoke-others ends every other session at once and keeps this one", async () => {
    const user = await member();
    const a = cookieOf(await login(user.email, PASSWORD, { ua: UA_A }));
    const b = cookieOf(await login(user.email, PASSWORD, { ua: UA_B }));
    const c = cookieOf(await login(user.email, PASSWORD, { ua: UA_B }));
    expect((await sessions(b)).status).toBe(200); // cached

    const res = await revokeOthers(
      request("POST", "/api/v1/me/sessions/revoke-others", {}, { cookie: a }),
      NO_PARAMS,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: 2 });

    expect((await sessions(b)).status).toBe(401);
    expect((await sessions(c)).status).toBe(401);
    expect((await sessions(a)).status).toBe(200);
    expect(
      await db.auditLog.count({ where: { actorId: user.id, action: "auth.sessions_revoked" } }),
    ).toBe(1);
  });

  it("AC-12 DELETE of another user's session id is 404 and leaves it alone", async () => {
    const me = await member();
    const other = await member();
    const mine = cookieOf(await login(me.email));
    await login(other.email);
    const theirs = await db.session.findFirstOrThrow({ where: { userId: other.id } });

    const del = (id: string) =>
      deleteSession(request("DELETE", `/api/v1/me/sessions/${id}`, undefined, { cookie: mine }), {
        params: Promise.resolve({ id }),
      });

    const res = await del(theirs.id);
    expect(res.status).toBe(404);
    expect((await errorBody(res)).code).toBe("NOT_FOUND");
    expect(await db.session.count({ where: { id: theirs.id } })).toBe(1);
    expect((await del("not-a-uuid")).status).toBe(404);
  });

  it("DELETE revokes one of my other sessions; revoking this one signs out", async () => {
    const user = await member();
    const a = cookieOf(await login(user.email));
    const b = cookieOf(await login(user.email));
    const rows = await db.session.findMany({ where: { userId: user.id } });
    const bRow = rows.find((r) => r.token === sha256(tokenOf(b)));
    const aRow = rows.find((r) => r.token === sha256(tokenOf(a)));
    if (!aRow || !bRow) throw new Error("sessions missing");

    const del = (id: string, cookie: string) =>
      deleteSession(request("DELETE", `/api/v1/me/sessions/${id}`, undefined, { cookie }), {
        params: Promise.resolve({ id }),
      });

    const other = await del(bRow.id, a);
    expect(other.status).toBe(204);
    expect(other.headers.get("set-cookie")).toBeNull();
    expect((await sessions(b)).status).toBe(401);

    const self = await del(aRow.id, a);
    expect(self.status).toBe(204);
    expect(self.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect((await sessions(a)).status).toBe(401);
  });

  it("requires a session", async () => {
    expect(
      (await listSessions(request("GET", "/api/v1/me/sessions", undefined), NO_PARAMS)).status,
    ).toBe(401);
  });
});

describe("rolling expiry", () => {
  it("slides a session refreshed over 24 h ago to 30 days and re-sends the cookie", async () => {
    const user = await member();
    const cookie = cookieOf(await login(user.email));
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS - 25 * 60 * 60 * 1000) },
    });
    // Set updated_at explicitly after the update above (Prisma's @updatedAt would overwrite it).
    await db.$executeRaw`UPDATE sessions SET updated_at = ${twoHoursAgo} WHERE user_id = ${user.id}::uuid`;

    const res = await sessions(cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(
      new RegExp(`^${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=259(19\\d\\d|2000)$`),
    );
    const row = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000);
    expect(row.updatedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("does not re-send the cookie for a session refreshed within 24 h", async () => {
    const user = await member();
    const cookie = cookieOf(await login(user.email));
    const res = await sessions(cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an expired session", async () => {
    const user = await member();
    const cookie = cookieOf(await login(user.email));
    await db.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await sessions(cookie)).status).toBe(401);
  });
});
