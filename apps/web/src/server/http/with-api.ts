import "server-only";
import { AppError } from "@ins/shared/errors";
import type { Logger } from "@ins/shared/logger";
import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ensureRedis } from "@/lib/redis";
import { Sentry } from "@/lib/sentry";
import { resolveRequestId } from "@/lib/security-headers";
import { getSession, type Role, type SessionContext } from "@/server/auth/session.service";
import { clientIp } from "./client-ip";
import { errorResponse, toErrorResponse } from "./errors";
import { withIdempotency } from "./idempotency";
import { type PolicyName, rateLimit, rateLimitHeaders } from "./rate-limit";

type Schema = z.ZodType;
type Infer<S> = S extends z.ZodType ? z.output<S> : undefined;

export interface ApiOptions<B, Q, P> {
  /** spec/api policy; every route is limited, `default` (600/min) unless named. */
  rateLimit?: PolicyName;
  /** `required` (default) → 401 without a session; `optional` uses one if present. */
  auth?: "required" | "optional" | "none";
  /** Implies `auth: "required"`. */
  roles?: readonly Role[];
  /** Unverified users may only reach /me and the auth routes (spec/api, Authentication). */
  allowUnverified?: boolean;
  body?: B;
  query?: Q;
  params?: P;
  /** Honour `Idempotency-Key` (spec/api). Requires a session. */
  idempotent?: boolean;
}

export interface ApiContext {
  request: Request;
  requestId: string;
  log: Logger;
  ip: string;
  session: SessionContext | null;
}

export interface ApiInput<B, Q, P> {
  body: Infer<B>;
  query: Infer<Q>;
  params: Infer<P>;
}

/** A handler returns a Response, a DTO (→ 200 JSON), or nothing (→ 204). */
export type ApiHandler<B, Q, P> = (
  ctx: ApiContext,
  input: ApiInput<B, Q, P>,
) => Promise<Response | object | undefined>;

/** What Next passes as a route handler's second argument (`{}` for static segments). */
interface RouteContext {
  params: Promise<Record<string, string | string[]>>;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const idempotencyKey = z.uuid();

/**
 * The request pipeline from spec/architecture, in order:
 * request context → rate limit → CSRF/Origin → authenticate → validate → authorize →
 * (idempotency) → handler → error map. Every response carries x-request-id and RateLimit-*.
 */
export function withApi<
  B extends Schema | undefined = undefined,
  Q extends Schema | undefined = undefined,
  P extends Schema | undefined = undefined,
>(options: ApiOptions<B, Q, P>, handler: ApiHandler<B, Q, P>) {
  const auth = options.roles ? "required" : (options.auth ?? "required");
  const policy = options.rateLimit ?? "default";
  // Resolved on first request: `next build` imports routes with an unvalidated environment.
  let allowedOrigins: Set<string> | undefined;

  return async function route(request: Request, routeContext: RouteContext): Promise<Response> {
    // 1. Request context
    const requestId = resolveRequestId(request.headers.get("x-request-id"));
    const url = new URL(request.url);
    const log = logger.child({ requestId, route: `${request.method} ${url.pathname}` });
    const ip = clientIp(request.headers);
    const headers = new Headers({ "x-request-id": requestId });

    const response = await Sentry.withIsolationScope(async (scope) => {
      scope.setTag("requestId", requestId);
      try {
        // The session is resolved up front because the rate-limit key is the user id when
        // there is one; it is only *enforced* in step 4.
        const session = auth === "none" ? null : await getSession(request);

        // 2. Rate limit
        const limit = await rateLimit(policy, session ? `u:${session.user.id}` : `ip:${ip}`, {
          redis: ensureRedis,
          log,
        });
        for (const [k, v] of Object.entries(rateLimitHeaders(limit))) headers.set(k, v);
        if (!limit.allowed) {
          return errorResponse(new AppError("RATE_LIMITED", "Too many requests."), requestId);
        }

        // 3. CSRF: unsafe methods must come from one of our origins. GET/HEAD/OPTIONS are
        // side-effect free and exempt (they are still rate limited above).
        if (UNSAFE_METHODS.has(request.method)) {
          const origin = request.headers.get("origin");
          allowedOrigins ??= new Set(env.ALLOWED_ORIGINS.map((o) => new URL(o).origin));
          if (!origin || !allowedOrigins.has(origin)) {
            log.warn({ origin }, "origin rejected");
            throw new AppError("FORBIDDEN", "Cross-origin request rejected.");
          }
        }

        // 4. Authenticate
        if (session) {
          if (session.user.status === "SUSPENDED") {
            throw new AppError("ACCOUNT_SUSPENDED", "This account is suspended.");
          }
          if (!session.user.emailVerified && !options.allowUnverified && auth !== "none") {
            throw new AppError("EMAIL_NOT_VERIFIED", "Verify your email to continue.");
          }
        } else if (auth === "required") {
          throw new AppError("UNAUTHENTICATED", "Sign in to continue.");
        }

        // 5. Validate
        const input = {
          body: await parsePart(options.body, () => readJson(request)),
          query: await parsePart(options.query, async () => searchParamsToObject(url.searchParams)),
          params: await parsePart(options.params, async () => await routeContext.params),
        } as ApiInput<B, Q, P>;

        // 6. Authorize
        if (options.roles && !(session && options.roles.includes(session.user.role))) {
          throw new AppError("FORBIDDEN", "You do not have access to this resource.");
        }

        // 7. Handler (optionally once per Idempotency-Key)
        const ctx: ApiContext = { request, requestId, log, ip, session };
        const run = async () => toResponse(await handler(ctx, input));
        const key = options.idempotent ? request.headers.get("idempotency-key") : null;
        if (key !== null) {
          if (!session) throw new AppError("UNAUTHENTICATED", "Sign in to continue.");
          if (!idempotencyKey.safeParse(key).success) {
            throw new AppError("VALIDATION_FAILED", "Idempotency-Key must be a UUID.", {
              fieldErrors: { "Idempotency-Key": ["Must be a UUID."] },
            });
          }
          return await withIdempotency(session.user.id, key, run, { redis: ensureRedis, log });
        }
        return await run();
      } catch (err) {
        // 8. Error map
        return toErrorResponse(err, {
          requestId,
          log,
          report: (e) => Sentry.captureException(e),
        });
      }
    });

    for (const [k, v] of headers) response.headers.set(k, v);
    return response;
  };
}

async function parsePart(
  schema: Schema | undefined,
  read: () => Promise<unknown>,
): Promise<unknown> {
  if (!schema) return undefined;
  // Unknown keys are rejected everywhere (spec/security, Input validation).
  const strict = schema instanceof z.ZodObject ? schema.strict() : schema;
  const result = strict.safeParse(await read());
  if (!result.success) {
    throw new AppError("VALIDATION_FAILED", "The request is invalid.", {
      fieldErrors: z.flattenError(result.error).fieldErrors,
    });
  }
  return result.data;
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("BAD_REQUEST", "The request body is not valid JSON.");
  }
}

function searchParamsToObject(params: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    out[key] = all.length === 1 ? (all[0] ?? "") : all;
  }
  return out;
}

function toResponse(result: Response | object | undefined): Response {
  if (result instanceof Response) return result;
  if (result === undefined) return new Response(null, { status: 204 });
  return Response.json(result);
}
