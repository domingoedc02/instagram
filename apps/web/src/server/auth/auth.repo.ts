import "server-only";
import { Prisma, prisma } from "@ins/db";
import type { Role, UserStatus } from "@ins/db";

/** Request facts every audit row carries (spec/security, Audit logging). */
export interface AuditMeta {
  ip: string;
  userAgent: string | null;
  requestId: string;
}

export interface NewSession {
  tokenHash: string;
  expiresAt: Date;
}

const verifyIdentifier = (userId: string) => `verify:${userId}`;
const VERIFY_PREFIX = "verify:";

function auditRow(action: string, actorId: string | null, meta: AuditMeta, extra: object = {}) {
  return {
    action,
    actorId,
    target: actorId ? `user:${actorId}` : null,
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
    meta: extra,
  };
}

export async function usernameExists(username: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  return row !== null;
}

export interface EmailOwner {
  id: string;
  name: string;
  emailVerified: boolean;
  status: UserStatus;
}

export function findUserByEmail(email: string): Promise<EmailOwner | null> {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, emailVerified: true, status: true },
  });
}

export interface CreateUserInput {
  email: string;
  username: string;
  name: string;
  birthdate: string;
  passwordHash: string;
  verification: { tokenHash: string; expiresAt: Date };
}

export type CreateUserResult =
  { kind: "created"; userId: string } | { kind: "email_taken" } | { kind: "username_taken" };

/**
 * User + credential account + verification token + `auth.sign_up`, atomically. A unique
 * violation is reported as which column collided rather than thrown, so the caller can keep the
 * existing-email path indistinguishable from a new sign-up.
 */
export async function createUserWithCredential(
  input: CreateUserInput,
  meta: AuditMeta,
): Promise<CreateUserResult> {
  try {
    const userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          username: input.username,
          name: input.name,
          birthdate: new Date(`${input.birthdate}T00:00:00Z`),
          emailVerified: false,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      await tx.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: input.passwordHash,
        },
      });
      await tx.verification.create({
        data: {
          identifier: verifyIdentifier(user.id),
          value: input.verification.tokenHash,
          expiresAt: input.verification.expiresAt,
        },
      });
      await tx.auditLog.create({ data: auditRow("auth.sign_up", user.id, meta) });
      return user.id;
    });
    return { kind: "created", userId };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = JSON.stringify(err.meta?.target ?? "");
      if (target.includes("email")) return { kind: "email_taken" };
      if (target.includes("username")) return { kind: "username_taken" };
    }
    throw err;
  }
}

/** Issues a fresh verification token; every earlier one for the user stops working (AC-11). */
export async function replaceVerificationToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await prisma.$transaction([
    prisma.verification.deleteMany({ where: { identifier: verifyIdentifier(userId) } }),
    prisma.verification.create({
      data: { identifier: verifyIdentifier(userId), value: tokenHash, expiresAt },
    }),
  ]);
}

export interface VerifiedUser {
  userId: string;
}

/**
 * Consumes a verification token and signs the user in, in one transaction: the token is deleted
 * (single use — a concurrent second click deletes nothing and gets null), the email is marked
 * verified, the session is created and `auth.email_verified` + `auth.sign_in` are audited.
 * Unknown, expired or already-used tokens return null and change nothing.
 */
export async function consumeVerificationToken(
  tokenHash: string,
  now: Date,
  session: NewSession,
  meta: AuditMeta,
): Promise<VerifiedUser | null> {
  return prisma.$transaction(async (tx) => {
    const token = await tx.verification.findFirst({
      where: { value: tokenHash, identifier: { startsWith: VERIFY_PREFIX } },
      select: { id: true, identifier: true, expiresAt: true },
    });
    if (!token || token.expiresAt <= now) return null;

    const claimed = await tx.verification.deleteMany({ where: { id: token.id } });
    if (claimed.count !== 1) return null;

    const userId = token.identifier.slice(VERIFY_PREFIX.length);
    const verified = await tx.user.updateMany({
      where: { id: userId, status: "ACTIVE" },
      data: { emailVerified: true },
    });
    if (verified.count !== 1) return null;

    await tx.verification.deleteMany({ where: { identifier: token.identifier } });
    await tx.session.create({
      data: {
        userId,
        token: session.tokenHash,
        expiresAt: session.expiresAt,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    await tx.auditLog.createMany({
      data: [
        auditRow("auth.email_verified", userId, meta),
        auditRow("auth.sign_in", userId, meta, { method: "email_verification" }),
      ],
    });
    return { userId };
  });
}

export interface SessionRow {
  id: string;
  expiresAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    role: Role;
    status: UserStatus;
    suspendedUntil: Date | null;
    emailVerified: boolean;
  };
}

export function findSessionByTokenHash(tokenHash: string): Promise<SessionRow | null> {
  return prisma.session.findUnique({
    where: { token: tokenHash },
    select: {
      id: true,
      expiresAt: true,
      updatedAt: true,
      user: {
        select: { id: true, role: true, status: true, suspendedUntil: true, emailVerified: true },
      },
    },
  });
}

/**
 * Marks a session active now (`updated_at` is lastActiveAt) and, when given, slides its expiry.
 * `updateMany` so a session revoked in the meantime is simply not found.
 */
export async function touchSession(sessionId: string, expiresAt?: Date): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId },
    data: { updatedAt: new Date(), ...(expiresAt ? { expiresAt } : {}) },
  });
}

export interface SignInCandidate {
  id: string;
  username: string;
  name: string;
  email: string;
  status: UserStatus;
  suspendedUntil: Date | null;
  emailVerified: boolean;
  passwordHash: string | null;
}

/** The user an identifier names (email or username, both citext) with its credential hash. */
export async function findSignInCandidate(
  by: { email: string } | { username: string },
): Promise<SignInCandidate | null> {
  const user = await prisma.user.findUnique({
    where: by,
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      status: true,
      suspendedUntil: true,
      emailVerified: true,
      accounts: { where: { providerId: "credential" }, select: { password: true }, take: 1 },
    },
  });
  if (!user) return null;
  const { accounts, ...rest } = user;
  return { ...rest, passwordHash: accounts[0]?.password ?? null };
}

/** Session row + `auth.sign_in`, atomically. */
export async function createSession(
  userId: string,
  session: NewSession,
  meta: AuditMeta,
): Promise<void> {
  await prisma.$transaction([
    prisma.session.create({
      data: {
        userId,
        token: session.tokenHash,
        expiresAt: session.expiresAt,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    }),
    prisma.auditLog.create({
      data: auditRow("auth.sign_in", userId, meta, { method: "password" }),
    }),
  ]);
}

/** An audit row outside any other write (failed sign-in, lockout). */
export async function writeAudit(
  action: string,
  actorId: string | null,
  meta: AuditMeta,
  extra: object = {},
): Promise<void> {
  await prisma.auditLog.create({ data: auditRow(action, actorId, meta, extra) });
}

export interface SessionListRow {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The user's live sessions, most recently active first. */
export function listSessions(userId: string, now: Date): Promise<SessionListRow[]> {
  return prisma.session.findMany({
    where: { userId, expiresAt: { gt: now } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, ipAddress: true, userAgent: true, createdAt: true, updatedAt: true },
  });
}

/**
 * Deletes sessions of `userId` and audits it in the same transaction. `only` deletes one session
 * (null when it is not the user's); `except` deletes all others. Returns the deleted token
 * hashes, so the caller can evict them from the session cache.
 */
export async function deleteSessions(
  userId: string,
  target: { only: string } | { except: string } | { all: true },
  action: string,
  meta: AuditMeta,
): Promise<string[] | null> {
  return prisma.$transaction(async (tx) => {
    const where =
      "only" in target
        ? { userId, id: target.only }
        : "except" in target
          ? { userId, id: { not: target.except } }
          : { userId };
    const rows = await tx.session.findMany({ where, select: { id: true, token: true } });
    if ("only" in target && rows.length === 0) return null;
    await tx.session.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    await tx.auditLog.create({
      data: auditRow(action, userId, meta, { sessionIds: rows.map((r) => r.id) }),
    });
    return rows.map((r) => r.token);
  });
}
