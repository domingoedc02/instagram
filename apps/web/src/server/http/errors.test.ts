import { AppError } from "@ins/shared/errors";
import { createLogger } from "@ins/shared/logger";
import { describe, expect, it, vi } from "vitest";
import { toErrorResponse } from "./errors";

const log = createLogger("test", { level: "silent" });

describe("toErrorResponse", () => {
  it("keeps an AppError's code, status and details", async () => {
    const res = toErrorResponse(new AppError("USERNAME_TAKEN", "Taken.", { field: "username" }), {
      requestId: "req-12345678",
      log,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: "USERNAME_TAKEN",
        message: "Taken.",
        details: { field: "username" },
        requestId: "req-12345678",
      },
    });
  });

  it("hides unknown errors behind 500 INTERNAL and reports them", async () => {
    const report = vi.fn();
    const error = vi.spyOn(log, "error");
    const res = toErrorResponse(new Error("password=hunter2 at db.ts:12"), {
      requestId: "req-12345678",
      log,
      report,
    });
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: { code: "INTERNAL", message: "Something went wrong.", requestId: "req-12345678" },
    });
    expect(text).not.toContain("hunter2");
    expect(report).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });
});
