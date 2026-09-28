import { execFileSync } from "node:child_process";

/** Applies the migrations to the test database (tmpfs, see infra/docker-compose.dev.yml). */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  execFileSync("prisma", ["migrate", "deploy"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: url,
      DIRECT_DATABASE_URL: url,
      PRISMA_HIDE_UPDATE_MESSAGE: "1",
    },
  });
}
