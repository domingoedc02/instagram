/**
 * Security headers from spec/security (Middleware & headers). Pure so it runs on the Edge
 * middleware and in unit tests alike.
 */
export interface CspSources {
  media: string;
  s3: string;
  realtime: string;
  dev: boolean;
}

function origin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function cspSourcesFromEnv(source: Record<string, string | undefined>): CspSources {
  return {
    media: origin(source.NEXT_PUBLIC_MEDIA_BASE_URL) ?? "",
    s3: origin(source.S3_PUBLIC_ENDPOINT) ?? "",
    realtime: origin(source.NEXT_PUBLIC_REALTIME_URL) ?? "",
    dev: source.NODE_ENV === "development",
  };
}

export function buildCsp(nonce: string, src: CspSources): string {
  const join = (...parts: string[]) => parts.filter(Boolean).join(" ");
  const directives = [
    "default-src 'self'",
    // React Refresh evaluates code in dev only; production never gets 'unsafe-eval'.
    `script-src ${join("'self'", `'nonce-${nonce}'`, "'strict-dynamic'", src.dev ? "'unsafe-eval'" : "")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${join("'self'", src.media, "data:", "blob:")}`,
    `media-src ${join("'self'", src.media, "blob:")}`,
    `connect-src ${join("'self'", src.s3, src.realtime, "https://*.ingest.sentry.io", src.dev ? "ws:" : "")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  return directives.join("; ");
}

export const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Frame-Options": "DENY",
};

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/** Reuses a well-formed inbound id (e.g. from Vercel or a client retry), else mints one. */
export function resolveRequestId(inbound: string | null): string {
  return inbound && REQUEST_ID.test(inbound) ? inbound : crypto.randomUUID();
}
