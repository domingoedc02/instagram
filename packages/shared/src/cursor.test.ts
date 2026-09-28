import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, idCursor, scoreCursor } from "./cursor";
import { AppError } from "./errors";

const id = "01920000-0000-7000-8000-000000000001";

describe("cursor", () => {
  it("round-trips id and score cursors", () => {
    expect(decodeCursor(encodeCursor({ id }), idCursor)).toEqual({ id });
    expect(decodeCursor(encodeCursor({ score: 1.5, id }), scoreCursor)).toEqual({ score: 1.5, id });
  });

  it("is url-safe", () => {
    expect(encodeCursor({ score: 123456.789, id })).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each(["not-base64!!", encodeCursor({ id: "nope" }), Buffer.from("[1]").toString("base64url")])(
    "rejects %s with BAD_REQUEST",
    (bad) => {
      expect(() => decodeCursor(bad, idCursor)).toThrow(AppError);
      try {
        decodeCursor(bad, idCursor);
      } catch (err) {
        expect((err as AppError).code).toBe("BAD_REQUEST");
      }
    },
  );
});
