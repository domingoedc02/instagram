import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma, UserStatus } from "@prisma/client";
import { createUser } from "./factories";
import { testDb, truncate } from "./db";

const db = testDb();

beforeEach(() => truncate(db, "users", "audit_logs", "verifications"));
afterAll(() => db.$disconnect());

function uniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

describe("users", () => {
  it("assigns time-ordered UUIDv7 ids", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(a.id < b.id).toBe(true);
  });

  it("treats emails and usernames case-insensitively (citext)", async () => {
    await createUser(db, { email: "A@x.com", username: "maya" });
    await expect(createUser(db, { email: "a@x.com" })).rejects.toSatisfy(uniqueViolation);
    await expect(createUser(db, { username: "MAYA" })).rejects.toThrow();
  });

  it("rejects usernames outside [a-z0-9._]{3,30}", async () => {
    for (const username of ["Bad Name!", "ab", "x".repeat(31), "UPPER"]) {
      await expect(createUser(db, { username })).rejects.toThrow(/users_username_format_chk/);
    }
  });

  it("lets the factory override any column", async () => {
    const until = new Date(Date.now() + 86_400_000);
    const user = await createUser(db, {
      status: UserStatus.SUSPENDED,
      suspendedUntil: until,
      emailVerified: false,
      isPrivate: true,
    });
    expect(user).toMatchObject({ status: "SUSPENDED", emailVerified: false, isPrivate: true });
    expect(user.suspendedUntil?.toISOString()).toBe(until.toISOString());
  });

  it("cascades sessions and keeps audit rows with a null actor on delete", async () => {
    const user = await createUser(db);
    await db.session.create({
      data: { userId: user.id, token: "hash", expiresAt: new Date(Date.now() + 1000) },
    });
    await db.auditLog.create({ data: { actorId: user.id, action: "auth.sign_in" } });
    await db.user.delete({ where: { id: user.id } });
    expect(await db.session.count()).toBe(0);
    const [log] = await db.auditLog.findMany();
    expect(log).toMatchObject({ actorId: null, action: "auth.sign_in", meta: {} });
  });
});
