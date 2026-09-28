import { createHash } from "node:crypto";
import type { EmailMessage } from "@ins/email";
import { createUser, testDb, truncate } from "@ins/db/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as resend } from "@/app/api/v1/auth/resend-verification/route";
import { POST as signUp } from "@/app/api/v1/auth/sign-up/route";
import { GET as usernameAvailable } from "@/app/api/v1/auth/username-available/route";
import { GET as verify } from "@/app/api/v1/auth/verify-email/route";
import { settleDeferred } from "@/lib/defer";
import { ensureRedis, redis } from "@/lib/redis";
import { SESSION_COOKIE, getSession } from "@/server/auth/session.service";

// env is parsed when the routes are imported, so this must run first.
vi.hoisted(() => {
  process.env.HIBP_ENABLED = "true";
});

const outbox = vi.hoisted(() => [] as EmailMessage[]);
vi.mock("@/lib/mailer", () => ({
  sendEmail: async (message: EmailMessage) => {
    outbox.push(message);
  },
}));

/** HIBP range API stub: `password1234` is breached, everything else is clean (with padding). */
const BREACHED = createHash("sha1").update("password1234").digest("hex").toUpperCase();
vi.stubGlobal(
  "fetch",
  vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (!url.startsWith("https://api.pwnedpasswords.com/range/")) {
      throw new Error(`unexpected fetch ${url}`);
    }
    const prefix = url.slice(-5);
    const lines = ["0000000000000000000000000000000000A:0"];
    if (prefix === BREACHED.slice(0, 5)) lines.push(`${BREACHED.slice(5)}:9545824`);
    return new Response(lines.join("\r\n"));
  }),
);

const db = testDb();
const ORIGIN = "http://localhost:3000";
const NO_PARAMS = { params: Promise.resolve({}) };
let ipSeq = 0;
const freshIp = () => `10.1.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

function post(path: string, body: unknown, ip = freshIp()) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}
function get(path: string, ip = freshIp(), cookie?: string) {
  return new Request(`${ORIGIN}${path}`, {
    headers: { "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
  });
}

let seq = 0;
function details(overrides: Record<string, string> = {}) {
  seq += 1;
  return {
    email: `new${seq}@test.local`,
    password: "a long unique passphrase",
    name: `New Person ${seq}`,
    username: `new_person_${seq}`,
    birthdate: "2000-05-17",
    ...overrides,
  };
}

async function mailTo(email: string): Promise<EmailMessage[]> {
  await settleDeferred();
  return outbox.filter((m) => m.to === email);
}

function tokenFrom(message: EmailMessage): string {
  const match = /verify-email\?token=([A-Za-z0-9_-]+)/.exec(message.text);
  if (!match?.[1]) throw new Error("no verification link in email");
  return match[1];
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const verifyUrl = (token: string) => `/api/v1/auth/verify-email?token=${token}`;

function yearsAgo(years: number, dayOffset = 0): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  await truncate(db, "users", "verifications", "audit_logs");
});

beforeEach(async () => {
  outbox.length = 0;
  await (await ensureRedis()).flushdb();
});

afterAll(async () => {
  await truncate(db, "users", "verifications", "audit_logs");
  await Promise.all([db.$disconnect(), redis.quit()]);
});

describe("POST /api/v1/auth/sign-up", () => {
  it("AC-1 creates an unverified account, sets no cookie and emails a link", async () => {
    const input = details();
    const res = await signUp(post("/api/v1/auth/sign-up", input), NO_PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("set-cookie")).toBeNull();

    const user = await db.user.findUniqueOrThrow({
      where: { email: input.email },
      include: { accounts: true, sessions: true },
    });
    expect(user).toMatchObject({
      emailVerified: false,
      status: "ACTIVE",
      username: input.username,
    });
    expect(user.birthdate.toISOString().slice(0, 10)).toBe(input.birthdate);
    expect(user.sessions).toHaveLength(0);
    expect(user.accounts).toHaveLength(1);
    expect(user.accounts[0]).toMatchObject({ providerId: "credential", accountId: user.id });
    expect(user.accounts[0]?.password).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);

    const [mail] = await mailTo(input.email);
    expect(mail?.subject).toBe("Confirm your email for INS");
    const token = tokenFrom(mail as EmailMessage);

    // Only the hash is stored: the raw token never reaches the database.
    const rows = await db.verification.findMany({ where: { identifier: `verify:${user.id}` } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe(sha256(token));
    expect(await db.verification.count({ where: { value: token } })).toBe(0);
    const hoursLeft = ((rows[0]?.expiresAt.getTime() ?? 0) - Date.now()) / 3_600_000;
    expect(hoursLeft).toBeGreaterThan(23.9);
    expect(hoursLeft).toBeLessThanOrEqual(24);

    const audit = await db.auditLog.findMany({ where: { actorId: user.id } });
    expect(audit.map((a) => a.action)).toEqual(["auth.sign_up"]);
    expect(JSON.stringify(audit)).not.toContain(input.email);
  });

  it("AC-3 rejects a 12-year-old and stores nothing", async () => {
    const input = details({ birthdate: yearsAgo(13, 1) });
    const before = await Promise.all([
      db.user.count(),
      db.account.count(),
      db.verification.count(),
    ]);

    const res = await signUp(post("/api/v1/auth/sign-up", input), NO_PARAMS);

    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("AGE_REQUIREMENT_NOT_MET");
    const after = await Promise.all([db.user.count(), db.account.count(), db.verification.count()]);
    expect(after).toEqual(before);
    expect(await mailTo(input.email)).toHaveLength(0);
  });

  it("accepts someone who turns 13 today", async () => {
    const res = await signUp(
      post("/api/v1/auth/sign-up", details({ birthdate: yearsAgo(13) })),
      NO_PARAMS,
    );
    expect(res.status).toBe(200);
  });

  it("AC-4 rejects a breached password with guidance", async () => {
    const input = details({ password: "password1234" });
    const res = await signUp(post("/api/v1/auth/sign-up", input), NO_PARAMS);

    expect(res.status).toBe(422);
    const { error } = await res.json();
    expect(error.code).toBe("PASSWORD_BREACHED");
    expect(error.details.fieldErrors.password[0]).toMatch(/breach/);
    expect(await db.user.count({ where: { email: input.email } })).toBe(0);
  });

  it("AC-5 answers 409 USERNAME_TAKEN for a claimed username, in any case", async () => {
    await createUser(db, { username: "maya" });
    const res = await signUp(
      post("/api/v1/auth/sign-up", details({ username: "Maya" })),
      NO_PARAMS,
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("USERNAME_TAKEN");
  });

  it("AC-6 answers an existing email exactly like a new one, and notifies the owner", async () => {
    const owner = await createUser(db, { email: "owner@test.local", name: "Owner" });
    const ip = freshIp();
    const fresh = await signUp(post("/api/v1/auth/sign-up", details(), ip), NO_PARAMS);
    const ip2 = freshIp();
    const taken = await signUp(
      post("/api/v1/auth/sign-up", details({ email: "OWNER@test.local" }), ip2),
      NO_PARAMS,
    );

    expect(taken.status).toBe(fresh.status);
    expect(await taken.text()).toBe(await fresh.text());
    const headers = (r: Response) =>
      [...r.headers].filter(([name]) => name !== "x-request-id").sort();
    expect(headers(taken)).toEqual(headers(fresh));
    expect(taken.headers.get("set-cookie")).toBeNull();

    // No second account, and the owner — not the attacker — hears about it.
    expect(await db.user.count({ where: { email: "owner@test.local" } })).toBe(1);
    const [notice] = await mailTo("owner@test.local");
    expect(notice?.subject).toBe("Someone tried to sign up with your email");
    expect(notice?.text).toContain(owner.name);
  });

  it("AC-8 limits sign-up to 5 per hour per IP", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i += 1) {
      const res = await signUp(post("/api/v1/auth/sign-up", details(), ip), NO_PARAMS);
      expect(res.status).toBe(200);
    }
    const sixth = await signUp(post("/api/v1/auth/sign-up", details(), ip), NO_PARAMS);
    expect(sixth.status).toBe(429);
    expect((await sixth.json()).error.code).toBe("RATE_LIMITED");
    expect(sixth.headers.get("Retry-After")).not.toBeNull();
  });

  it("rejects a cross-origin sign-up (CSRF)", async () => {
    const req = post("/api/v1/auth/sign-up", details());
    req.headers.set("origin", "https://evil.example");
    const res = await signUp(req, NO_PARAMS);
    expect(res.status).toBe(403);
  });

  it("rejects unknown fields and invalid input with VALIDATION_FAILED", async () => {
    const res = await signUp(
      post("/api/v1/auth/sign-up", { ...details(), role: "ADMIN", password: "short" }),
      NO_PARAMS,
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
  });
});

describe("GET /api/v1/auth/username-available", () => {
  it("AC-5 / AC-10 reports taken, reserved and malformed names as unavailable", async () => {
    await createUser(db, { username: "leo" });
    const check = async (u: string) =>
      (
        await (
          await usernameAvailable(get(`/api/v1/auth/username-available?u=${u}`), NO_PARAMS)
        ).json()
      ).available;

    expect(await check("leo")).toBe(false);
    expect(await check("LEO")).toBe(false);
    expect(await check("admin")).toBe(false);
    expect(await check("a")).toBe(false);
    expect(await check("free.name_1")).toBe(true);
  });

  it("AC-10 refuses to sign up the reserved username admin", async () => {
    const res = await signUp(
      post("/api/v1/auth/sign-up", details({ username: "admin" })),
      NO_PARAMS,
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.details.fieldErrors.username[0]).toMatch(/isn't available/);
  });

  it("limits the check to 30 per minute per IP", async () => {
    const ip = freshIp();
    for (let i = 0; i < 30; i += 1) {
      await usernameAvailable(get("/api/v1/auth/username-available?u=abc", ip), NO_PARAMS);
    }
    const res = await usernameAvailable(
      get("/api/v1/auth/username-available?u=abc", ip),
      NO_PARAMS,
    );
    expect(res.status).toBe(429);
  });
});

describe("GET /api/v1/auth/verify-email", () => {
  async function signedUp() {
    const input = details();
    await signUp(post("/api/v1/auth/sign-up", input), NO_PARAMS);
    const [mail] = await mailTo(input.email);
    const user = await db.user.findUniqueOrThrow({ where: { email: input.email } });
    return { input, user, token: tokenFrom(mail as EmailMessage) };
  }

  it("AC-2 verifies the email, signs the user in and audits both", async () => {
    const { user, token } = await signedUp();
    const res = await verify(get(verifyUrl(token)), NO_PARAMS);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/`);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(
      new RegExp(`^${SESSION_COOKIE.replace(".", "\\.")}=[A-Za-z0-9_-]{43}; `),
    );
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");

    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(true);
    expect(await db.verification.count({ where: { identifier: `verify:${user.id}` } })).toBe(0);

    // The session row holds the SHA-256 of the cookie value, never the value.
    const cookieToken = cookie.split(";")[0]?.split("=")[1] ?? "";
    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.token).toBe(sha256(cookieToken));
    expect(session.token).not.toBe(cookieToken);

    const actions = (
      await db.auditLog.findMany({ where: { actorId: user.id }, orderBy: { createdAt: "asc" } })
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(["auth.sign_up", "auth.email_verified", "auth.sign_in"]),
    );

    const resolved = await getSession(get("/", freshIp(), `${SESSION_COOKIE}=${cookieToken}`));
    expect(resolved?.user).toMatchObject({ id: user.id, emailVerified: true, role: "USER" });
    // Second resolution comes from the Redis cache and agrees.
    const cached = await getSession(get("/", freshIp(), `${SESSION_COOKIE}=${cookieToken}`));
    expect(cached).toEqual(resolved);
  });

  it("AC-7 rejects a used token without creating a session", async () => {
    const { user, token } = await signedUp();
    await verify(get(verifyUrl(token)), NO_PARAMS);
    await db.session.deleteMany({ where: { userId: user.id } });

    const again = await verify(get(verifyUrl(token)), NO_PARAMS);
    expect(again.status).toBe(302);
    expect(again.headers.get("location")).toBe(`${ORIGIN}/verify-email?status=invalid`);
    expect(again.headers.get("set-cookie")).toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("AC-7 rejects an expired token and leaves the account unverified", async () => {
    const { user, token } = await signedUp();
    await db.verification.updateMany({
      where: { identifier: `verify:${user.id}` },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await verify(get(verifyUrl(token)), NO_PARAMS);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/verify-email?status=invalid`);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(false);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it.each([
    ["empty", ""],
    ["short", "garbage"],
    ["unknown", "x".repeat(43)],
    ["oversized", "x".repeat(500)],
  ])("rejects an %s token", async (_label, token) => {
    const res = await verify(get(verifyUrl(token)), NO_PARAMS);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/verify-email?status=invalid`);
  });

  it("does not sign in a suspended account", async () => {
    const { user, token } = await signedUp();
    await db.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    const res = await verify(get(verifyUrl(token)), NO_PARAMS);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("POST /api/v1/auth/resend-verification", () => {
  it("AC-9 answers 204 for unknown and unverified emails, mailing only the account", async () => {
    const input = details();
    await signUp(post("/api/v1/auth/sign-up", input), NO_PARAMS);
    await mailTo(input.email);
    outbox.length = 0;

    const unknown = await resend(
      post("/api/v1/auth/resend-verification", { email: "nobody@test.local" }),
      NO_PARAMS,
    );
    const known = await resend(
      post("/api/v1/auth/resend-verification", { email: input.email }),
      NO_PARAMS,
    );

    expect(unknown.status).toBe(204);
    expect(known.status).toBe(204);
    expect(await unknown.text()).toBe("");
    expect(await mailTo("nobody@test.local")).toHaveLength(0);
    expect(await mailTo(input.email)).toHaveLength(1);
  });

  it("sends nothing for an already-verified account", async () => {
    const verified = await createUser(db, { emailVerified: true });
    const res = await resend(
      post("/api/v1/auth/resend-verification", { email: verified.email }),
      NO_PARAMS,
    );
    expect(res.status).toBe(204);
    expect(await mailTo(verified.email)).toHaveLength(0);
  });

  it("AC-11 invalidates the earlier link when a new one is issued", async () => {
    const input = details();
    await signUp(post("/api/v1/auth/sign-up", input), NO_PARAMS);
    await resend(post("/api/v1/auth/resend-verification", { email: input.email }), NO_PARAMS);
    await resend(post("/api/v1/auth/resend-verification", { email: input.email }), NO_PARAMS);
    const mails = await mailTo(input.email);
    expect(mails).toHaveLength(3);
    const [first, second, latest] = mails.map((m) => tokenFrom(m));

    for (const stale of [first, second]) {
      const res = await verify(get(verifyUrl(stale as string)), NO_PARAMS);
      expect(res.headers.get("location")).toBe(`${ORIGIN}/verify-email?status=invalid`);
    }
    const ok = await verify(get(verifyUrl(latest as string)), NO_PARAMS);
    expect(ok.headers.get("location")).toBe(`${ORIGIN}/`);
    expect(ok.headers.get("set-cookie")).not.toBeNull();
  });

  it("limits resends to 3 per hour per email, across IPs", async () => {
    const email = "limited@test.local";
    for (let i = 0; i < 3; i += 1) {
      const res = await resend(post("/api/v1/auth/resend-verification", { email }), NO_PARAMS);
      expect(res.status).toBe(204);
    }
    const res = await resend(
      post("/api/v1/auth/resend-verification", { email: "LIMITED@test.local" }),
      NO_PARAMS,
    );
    expect(res.status).toBe(429);
  });

  it("limits resends to 10 per hour per IP", async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i += 1) {
      await resend(
        post("/api/v1/auth/resend-verification", { email: `r${i}@test.local` }, ip),
        NO_PARAMS,
      );
    }
    const res = await resend(
      post("/api/v1/auth/resend-verification", { email: "r10@test.local" }, ip),
      NO_PARAMS,
    );
    expect(res.status).toBe(429);
  });
});
