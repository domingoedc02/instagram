/**
 * Error codes and HTTP statuses from spec/api. Every API error is returned as
 * `{ error: { code, message, details, requestId } }`.
 */
export const ErrorCode = {
  BAD_REQUEST: 400,
  TOKEN_INVALID: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  EMAIL_NOT_VERIFIED: 403,
  ACCOUNT_SUSPENDED: 403,
  PRIVATE_ACCOUNT: 403,
  COMMENTS_DISABLED: 403,
  BLOCKED: 403,
  MEDIA_REJECTED: 403,
  UNDERAGE: 403,

  NOT_FOUND: 404,
  CONFLICT: 409,
  EMAIL_TAKEN: 409,
  USERNAME_TAKEN: 409,
  MEDIA_NOT_READY: 409,
  NOT_UPLOADED: 409,
  EXPORT_IN_PROGRESS: 409,
  ALREADY_ASSIGNED: 409,
  NAME_TAKEN: 409,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  VALIDATION_FAILED: 422,
  PASSWORD_BREACHED: 422,
  AGE_REQUIREMENT_NOT_MET: 422,
  PASSWORD_REUSED: 422,
  ACCOUNT_LOCKED: 423,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ErrorCode;

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

/** Thrown by services; the HTTP pipeline maps it to the error envelope. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? code);
    this.name = "AppError";
    this.code = code;
    this.status = ErrorCode[code];
    this.details = details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
