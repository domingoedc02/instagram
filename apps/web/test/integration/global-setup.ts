import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Applies the migrations to the tmpfs test database, as packages/db's suite does. */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: fileURLToPath(new URL("../../../../packages/db", import.meta.url)),
    stdio: "ignore",
    env: {
      ...process.env,
      DATABASE_URL: url,
      DIRECT_DATABASE_URL: url,
      PRISMA_HIDE_UPDATE_MESSAGE: "1",
    },
  });
}
