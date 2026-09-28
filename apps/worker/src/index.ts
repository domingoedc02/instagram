import { createLogger } from "@ins/shared/logger";

const log = createLogger("worker");

// Queue processors are registered here as their stories land (media, fanout, ...).
// Until then the process stays alive so the Dokploy service has a stable shape.
const keepalive = setInterval(() => undefined, 60_000);

log.info("worker ready");

function shutdown(signal: NodeJS.Signals): void {
  log.info({ signal }, "worker shutting down");
  clearInterval(keepalive);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
