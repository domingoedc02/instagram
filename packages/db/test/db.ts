import { Prisma, PrismaClient } from "@prisma/client";

/** A client bound to TEST_DATABASE_URL, for integration tests only. */
export function testDb(): PrismaClient {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  return new PrismaClient({ datasourceUrl: url });
}

/** Empties the given tables; CASCADE takes dependent rows with them. Names are test constants. */
export async function truncate(db: PrismaClient, ...tables: string[]): Promise<void> {
  const list = Prisma.raw(tables.map((t) => `"${t.replaceAll('"', "")}"`).join(", "));
  await db.$executeRaw`TRUNCATE ${list} RESTART IDENTITY CASCADE`;
}
