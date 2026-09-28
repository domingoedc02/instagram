import "server-only";
import { Redis } from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

const globalForRedis = globalThis as unknown as { insRedis?: Redis };

function createRedis(): Redis {
  const client = new Redis(env.REDIS_URL, {
    // Fail fast: a request must never hang on Redis. Callers decide to fail open or closed.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
    lazyConnect: true,
  });
  client.on("error", (err: Error) => logger.warn({ err: err.message }, "redis error"));
  return client;
}

// One connection per process; dev hot reload would otherwise open a new one per edit.
export const redis: Redis = globalForRedis.insRedis ?? createRedis();
if (env.NODE_ENV !== "production") globalForRedis.insRedis = redis;

/**
 * Resolves once the connection is ready. With the offline queue off, a command sent before the
 * first connect would be rejected, so the first caller opens the connection.
 */
export async function ensureRedis(): Promise<Redis> {
  if (redis.status === "wait") await redis.connect();
  return redis;
}
