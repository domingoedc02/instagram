import "server-only";
import type { Logger } from "@ins/shared/logger";
import type { Redis, Result } from "ioredis";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

interface Window {
  limit: number;
  windowMs: number;
}

/** Limits from spec/api (Idempotency & rate limits). A policy may stack several windows. */
export const POLICIES = {
  // INS-23: 20 per 15 min per IP (the approved story supersedes spec/api's 10).
  "auth-sign-in": [{ limit: 20, windowMs: 15 * MIN }],
  "auth-sign-up": [{ limit: 5, windowMs: HOUR }],
  "auth-forget-password": [{ limit: 3, windowMs: HOUR }],
  // INS-22: resend is limited per IP here and per sha256(email) in the route.
  "auth-resend-verification": [{ limit: 10, windowMs: HOUR }],
  "auth-resend-verification-email": [{ limit: 3, windowMs: HOUR }],
  "auth-verify-email": [{ limit: 30, windowMs: HOUR }],
  "auth-username-available": [{ limit: 30, windowMs: MIN }],
  "media-uploads": [{ limit: 60, windowMs: HOUR }],
  posts: [{ limit: 25, windowMs: HOUR }],
  stories: [{ limit: 50, windowMs: DAY }],
  comments: [{ limit: 60, windowMs: 10 * MIN }],
  likes: [{ limit: 300, windowMs: HOUR }],
  follows: [
    { limit: 100, windowMs: HOUR },
    { limit: 500, windowMs: DAY },
  ],
  "dms-send": [{ limit: 120, windowMs: MIN }],
  "dms-new-conversation": [{ limit: 30, windowMs: DAY }],
  reports: [{ limit: 20, windowMs: DAY }],
  search: [{ limit: 60, windowMs: MIN }],
  export: [{ limit: 1, windowMs: DAY }],
  default: [{ limit: 600, windowMs: MIN }],
} as const satisfies Record<string, readonly Window[]>;

export type PolicyName = keyof typeof POLICIES;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until a slot frees up; 0 when allowed. */
  retryAfter: number;
}

/**
 * Sliding-window log on one ZSET per policy and key. Atomic: trims entries older than the
 * longest window, counts each window, and records the hit only when every window has room, so
 * rejected attempts do not extend the lockout. Returns {allowed, limit, remaining, retryAfterMs}.
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local member = ARGV[2]
local longest = 0
for i = 3, #ARGV, 2 do
  local w = tonumber(ARGV[i + 1])
  if w > longest then longest = w end
end
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - longest)
local limitOut, remaining, retry = 0, -1, 0
for i = 3, #ARGV, 2 do
  local limit = tonumber(ARGV[i])
  local w = tonumber(ARGV[i + 1])
  local count = redis.call('ZCOUNT', key, '(' .. (now - w), '+inf')
  if count >= limit then
    local freeing = redis.call('ZRANGEBYSCORE', key, '(' .. (now - w), '+inf', 'WITHSCORES', 'LIMIT', count - limit, 1)
    local wait = tonumber(freeing[2]) + w - now
    if wait > retry then retry = wait; limitOut = limit end
  elseif retry == 0 and (remaining == -1 or limit - count - 1 < remaining) then
    remaining = limit - count - 1
    limitOut = limit
  end
end
if retry > 0 then return {0, limitOut, 0, retry} end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, longest)
return {1, limitOut, remaining, 0}
`;

declare module "ioredis" {
  interface RedisCommander<Context> {
    rlSlidingWindow(
      key: string,
      ...args: (string | number)[]
    ): Result<[number, number, number, number], Context>;
  }
}

const scripted = new WeakSet<Redis>();

function withScript(redis: Redis): Redis {
  if (!scripted.has(redis)) {
    redis.defineCommand("rlSlidingWindow", { numberOfKeys: 1, lua: SLIDING_WINDOW_LUA });
    scripted.add(redis);
  }
  return redis;
}

export interface RateLimitDeps {
  redis: () => Promise<Redis>;
  log: Logger;
  now?: () => number;
}

/**
 * Checks and records one hit. On a Redis failure general policies fail open (availability
 * beats a missed limit), but `auth-*` policies fail closed: brute-force protection must hold.
 */
export async function rateLimit(
  policy: PolicyName,
  key: string,
  deps: RateLimitDeps,
): Promise<RateLimitResult> {
  const windows: readonly Window[] = POLICIES[policy];
  const now = deps.now?.() ?? Date.now();
  try {
    const redis = withScript(await deps.redis());
    const args = windows.flatMap((w) => [w.limit, w.windowMs]);
    const member = `${now}:${crypto.randomUUID()}`;
    const [allowed, limit, remaining, retryMs] = await redis.rlSlidingWindow(
      `rl:${policy}:${key}`,
      now,
      member,
      ...args,
    );
    return {
      allowed: allowed === 1,
      limit,
      remaining: Math.max(0, remaining),
      retryAfter: allowed === 1 ? 0 : Math.max(1, Math.ceil(retryMs / 1000)),
    };
  } catch (err) {
    const failClosed = policy.startsWith("auth-");
    deps.log.error(
      { err: err instanceof Error ? err.message : String(err), policy, failClosed },
      "rate limiter unavailable",
    );
    const tightest = Math.min(...windows.map((w) => w.limit));
    return failClosed
      ? { allowed: false, limit: tightest, remaining: 0, retryAfter: 30 }
      : { allowed: true, limit: tightest, remaining: tightest, retryAfter: 0 };
  }
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
  };
  if (!result.allowed) headers["Retry-After"] = String(result.retryAfter);
  return headers;
}
