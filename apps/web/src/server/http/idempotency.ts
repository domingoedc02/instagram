import "server-only";
import { AppError } from "@ins/shared/errors";
import type { Logger } from "@ins/shared/logger";
import type { Redis } from "ioredis";

const TTL_SECONDS = 86_400;
const PENDING = JSON.stringify({ state: "pending" });

interface StoredResponse {
  state: "done";
  status: number;
  contentType: string | null;
  body: string;
}

export interface IdempotencyDeps {
  redis: () => Promise<Redis>;
  log: Logger;
}

/**
 * Runs `handler` at most once per `Idempotency-Key` and user for 24h (spec/api). A replay gets
 * the stored status and body; a duplicate that arrives while the first is still running gets
 * 409 CONFLICT. Server errors are not stored, so the client may retry them. If Redis is down the
 * request runs without the guarantee rather than failing.
 */
export async function withIdempotency(
  userId: string,
  idempotencyKey: string,
  handler: () => Promise<Response>,
  deps: IdempotencyDeps,
): Promise<Response> {
  const key = `idem:${userId}:${idempotencyKey}`;
  let redis: Redis;
  try {
    redis = await deps.redis();
    const claimed = await redis.set(key, PENDING, "EX", TTL_SECONDS, "NX");
    if (claimed === null) return await replay(redis, key);
  } catch (err) {
    if (err instanceof AppError) throw err;
    deps.log.error(
      { err: err instanceof Error ? err.message : String(err) },
      "idempotency store unavailable",
    );
    return handler();
  }

  let response: Response;
  try {
    response = await handler();
  } catch (err) {
    await redis.del(key).catch(() => undefined);
    throw err;
  }

  try {
    if (response.status >= 500) {
      await redis.del(key);
    } else {
      const stored: StoredResponse = {
        state: "done",
        status: response.status,
        contentType: response.headers.get("content-type"),
        body: await response.clone().text(),
      };
      await redis.set(key, JSON.stringify(stored), "EX", TTL_SECONDS, "XX");
    }
  } catch (err) {
    deps.log.error(
      { err: err instanceof Error ? err.message : String(err) },
      "idempotency store write failed",
    );
  }
  return response;
}

async function replay(redis: Redis, key: string): Promise<Response> {
  const raw = await redis.get(key);
  const stored = raw ? (JSON.parse(raw) as StoredResponse | { state: "pending" }) : null;
  if (!stored || stored.state !== "done") {
    throw new AppError("CONFLICT", "A request with this Idempotency-Key is still in progress.");
  }
  const headers = new Headers({ "Idempotent-Replayed": "true" });
  if (stored.contentType) headers.set("content-type", stored.contentType);
  return new Response(stored.status === 204 ? null : stored.body, {
    status: stored.status,
    headers,
  });
}
