import "server-only";
import type { Logger } from "@ins/shared/logger";
import { after } from "next/server";

const inflight = new Set<Promise<unknown>>();

/**
 * Runs `task` after the response is sent (Next `after()`), so work such as sending email adds
 * no latency and cannot be timed (anti-enumeration, INS-22). Outside a request scope — scripts
 * and tests — it starts immediately and `settleDeferred()` awaits it. Failures are logged.
 */
export function defer(task: () => Promise<unknown>, log: Logger, label: string): void {
  const run = async () => {
    try {
      await task();
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err), task: label },
        "deferred task failed",
      );
    }
  };
  try {
    after(run);
  } catch {
    const promise = run();
    inflight.add(promise);
    promise.finally(() => inflight.delete(promise)).catch(() => undefined);
  }
}

/** Awaits deferred tasks started outside a request scope. */
export async function settleDeferred(): Promise<void> {
  await Promise.all(inflight);
}
