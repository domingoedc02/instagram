import { type NextRequest, NextResponse } from "next/server";
import {
  STATIC_SECURITY_HEADERS,
  buildCsp,
  cspSourcesFromEnv,
  resolveRequestId,
} from "@/lib/security-headers";

// Mirrors SESSION_COOKIE in server/auth (that module is Node-only).
const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Secure-ins.session_token" : "ins.session_token";

/**
 * URLs that carry a one-time email token: the landing pages and the API routes they hand off to.
 * Middleware headers win over a route's own, so the policy has to be set here.
 */
const TOKEN_PATHS = /^\/(api\/v1\/auth\/)?(verify-email|reset-password)(\/|$)/;

/**
 * Page routes of the `(main)` group — signed-in only. Profiles and post permalinks stay public
 * (spec/security, Authorization matrix). This is a UX redirect; the API enforces auth itself.
 */
const PROTECTED = [
  /^\/$/,
  /^\/(explore|reels|direct|notifications|saved|settings|admin|stories|create)(\/|$)/,
];

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const requestId = resolveRequestId(request.headers.get("x-request-id"));

  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (!hasSession && PROTECTED.some((re) => re.test(pathname))) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    const redirect = NextResponse.redirect(login);
    redirect.headers.set("x-request-id", requestId);
    return withSecurityHeaders(redirect, null, pathname);
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, cspSourcesFromEnv(process.env));

  // Forwarded to the app: layout.tsx reads x-nonce, route handlers read x-request-id.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  return withSecurityHeaders(response, csp, pathname);
}

function withSecurityHeaders(
  response: NextResponse,
  csp: string | null,
  pathname: string,
): NextResponse {
  if (csp) response.headers.set("Content-Security-Policy", csp);
  for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  // Email-token landing pages: the token in the URL must never leak via Referer (INS-22).
  if (TOKEN_PATHS.test(pathname)) response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      // Prefetches are served from cache without the nonce, so skip them (Next CSP guide).
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
