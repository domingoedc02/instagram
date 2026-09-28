import { PrismaClient } from "@prisma/client";

// One client per process. In dev, Next's hot reload re-evaluates modules, so the instance is
// cached on globalThis to avoid exhausting PgBouncer's client slots.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { Prisma, PrismaClient, Role, UserStatus } from "@prisma/client";
export type { Account, AuditLog, Session, User, Verification } from "@prisma/client";
