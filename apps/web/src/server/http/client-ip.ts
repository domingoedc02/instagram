/**
 * The caller's IP for rate-limit keys (spec/security, Rate limiting). On Vercel only the
 * platform-set headers are trusted; `x-forwarded-for` is client-controllable there. Off Vercel
 * (local, Dokploy behind Traefik) the first XFF hop is set by our own proxy.
 */
export function clientIp(headers: Headers, onVercel = Boolean(process.env.VERCEL)): string {
  const first = (value: string | null) => value?.split(",")[0]?.trim() || null;
  const platform = first(headers.get("x-real-ip")) ?? first(headers.get("x-vercel-forwarded-for"));
  if (platform) return platform;
  if (!onVercel) {
    const hop = first(headers.get("x-forwarded-for"));
    if (hop) return hop;
  }
  return "unknown";
}
