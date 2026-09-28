import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, User } from "@prisma/client";

/**
 * Inserts a user with unique, valid defaults. Every column can be overridden, which the
 * integration tests rely on (a SUSPENDED user, an unverified one, a fixed email, ...).
 */
export async function createUser(
  db: PrismaClient,
  overrides: Partial<Prisma.UserUncheckedCreateInput> = {},
): Promise<User> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  return db.user.create({
    data: {
      email: `user_${suffix}@test.local`,
      username: `user_${suffix}`,
      name: `Test User ${suffix}`,
      emailVerified: true,
      birthdate: new Date("2000-01-01"),
      ...overrides,
    },
  });
}
