// Dev/staging seed (spec/setup, Seed data). Idempotent: users are upserted by email, so running
// it twice leaves the same five accounts. Content (posts, stories, graph) arrives with its epics.
import { hashPassword } from "@ins/shared/password";
import { createLogger } from "@ins/shared/logger";
import { prisma, Role, type Prisma } from "../src/index";

const log = createLogger("seed");

if (process.env.NODE_ENV === "production") {
  log.fatal("refusing to seed: NODE_ENV=production");
  process.exit(1);
}

const PASSWORD = "password1234";

const USERS: Array<Omit<Prisma.UserCreateInput, "birthdate" | "emailVerified">> = [
  { username: "maya", email: "maya@ins.local", name: "Maya Chen", bio: "Film photography" },
  { username: "leo", email: "leo@ins.local", name: "Leo Marquez", bio: "Creator · travel" },
  { username: "ana", email: "ana@ins.local", name: "Ana Silva", isPrivate: true },
  { username: "sam", email: "sam@ins.local", name: "Sam Okoro", role: Role.MODERATOR },
  { username: "admin", email: "admin@ins.local", name: "INS Admin", role: Role.ADMIN },
];

async function main(): Promise<void> {
  const password = await hashPassword(PASSWORD);

  for (const data of USERS) {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: data.email },
        create: { ...data, emailVerified: true, birthdate: new Date("1995-06-15") },
        update: {},
      });
      await tx.account.upsert({
        where: { providerId_accountId: { providerId: "credential", accountId: user.id } },
        create: { providerId: "credential", accountId: user.id, userId: user.id, password },
        update: {},
      });
    });
  }

  log.info({ users: await prisma.user.count() }, `seeded (password: ${PASSWORD})`);
}

main()
  .catch((err: unknown) => {
    log.error({ err }, "seed failed");
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
