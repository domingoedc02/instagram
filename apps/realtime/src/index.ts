import { createServer } from "node:http";
import { Server } from "socket.io";
import { createLogger } from "@ins/shared/logger";
import { env } from "./lib/env";

const log = createLogger("realtime");
const port = env.REALTIME_PORT;

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(404).end();
});

// Auth, rooms and the dm/typing/presence handlers land with the DM epic.
const io = new Server(http, {
  cors: { origin: env.ALLOWED_ORIGINS, credentials: true },
});

io.on("connection", (socket) => {
  log.debug({ id: socket.id }, "socket connected");
});

http.listen(port, () => log.info({ port }, "realtime listening"));

function shutdown(signal: NodeJS.Signals): void {
  log.info({ signal }, "realtime shutting down");
  void io.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
