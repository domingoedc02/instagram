import "server-only";
import * as Sentry from "@sentry/nextjs";
import { env } from "./env";

/** Server-side Sentry. No PII leaves the process (spec/security, Audit logging). */
export function initSentry(): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // v11 collects user info, cookies, headers, bodies and query params by default; turn all off.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) {
          delete event.request.headers.cookie;
          delete event.request.headers.authorization;
        }
      }
      delete event.user;
      return event;
    },
  });
}

export { Sentry };
