// Runs once per server start, before any request: a bad environment fails the boot, not a request.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/env");
    await import("./lib/env.client");
  }
}
