import { AppError, type ErrorBody, isAppError } from "@ins/shared/errors";
import type { Logger } from "@ins/shared/logger";

export interface ErrorMapperDeps {
  requestId: string;
  log: Logger;
  report?: (err: unknown) => void;
}

/**
 * Maps any thrown value to the spec/api error envelope. Known `AppError`s keep their code and
 * details; anything else becomes 500 INTERNAL with only the requestId, and is logged and reported.
 */
export function toErrorResponse(err: unknown, deps: ErrorMapperDeps): Response {
  if (isAppError(err)) {
    if (err.status >= 500) deps.log.error({ err }, "request failed");
    return errorResponse(err, deps.requestId);
  }
  deps.log.error({ err }, "unhandled error");
  deps.report?.(err);
  return errorResponse(new AppError("INTERNAL", "Something went wrong."), deps.requestId);
}

export function errorResponse(err: AppError, requestId: string): Response {
  const body: ErrorBody = {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details === undefined ? {} : { details: err.details }),
      requestId,
    },
  };
  return Response.json(body, { status: err.status });
}
