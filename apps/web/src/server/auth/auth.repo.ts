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
  user: { id: string; role: Role; status: UserStatus; emailVerified: boolean };
}

export function findSessionByTokenHash(tokenHash: string): Promise<SessionRow | null> {
  return prisma.session.findUnique({
    where: { token: tokenHash },
    select: {
      id: true,
      expiresAt: true,
      user: { select: { id: true, role: true, status: true, emailVerified: true } },
    },
  });
}
