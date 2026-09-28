import { pino, type Logger, type LoggerOptions } from "pino";

/**
 * Keys that must never reach logs. Paths cover both top-level and one-level
 * nested objects (`*.password`), plus request headers carrying credentials.
 */
export const REDACT_PATHS = [
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "secret",
  "authorization",
  "cookie",
  "email",
  "*.password",
  "*.newPassword",
  "*.currentPassword",
  "*.token",
  "*.secret",
  "*.authorization",
  "*.cookie",
  "*.email",
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  "headers.authorization",
  "headers.cookie",
];

export function createLogger(service: string, options: LoggerOptions = {}): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
    base: { service },
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    ...options,
  });
}

export type { Logger };
