import "server-only";
import { createHash } from "node:crypto";
import type { Logger } from "@ins/shared/logger";

export interface HibpDeps {
  log: Logger;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const RANGE_URL = "https://api.pwnedpasswords.com/range/";

/**
 * Have I Been Pwned k-anonymity range check (spec/security T1): only the first 5 hex chars of
 * the SHA-1 leave the process. `Add-Padding` hides the response size. Fails open after 1.5 s or
 * on any error — availability of sign-up beats the check — and logs a warning.
 */
export async function isPasswordBreached(password: string, deps: HibpDeps): Promise<boolean> {
  const digest = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  try {
    const res = await (deps.fetch ?? fetch)(`${RANGE_URL}${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "ins-web" },
      signal: AbortSignal.timeout(deps.timeoutMs ?? 1_500),
    });
    if (!res.ok) throw new Error(`HIBP responded ${res.status}`);
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [candidate, count] = line.trim().split(":");
      // Padding entries carry a count of 0.
      if (candidate === suffix) return Number(count) > 0;
    }
    return false;
  } catch (err) {
    deps.log.warn({ err: err instanceof Error ? err.message : String(err) }, "HIBP check skipped");
    return false;
  }
}
