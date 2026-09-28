import { Writable } from "node:stream";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { REDACT_PATHS } from "./logger";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const log = pino({ redact: { paths: REDACT_PATHS, censor: "[redacted]" } }, stream);
  return { log, lines };
}

describe("logger redaction", () => {
  it("redacts top-level, nested and header secrets", () => {
    const { log, lines } = capture();
    log.info(
      {
        password: "a",
        body: { password: "b", token: "c", email: "me@example.com" },
        req: { headers: { cookie: "sid=1", authorization: "Bearer x" } },
      },
      "hello",
    );
    const out = lines.join("");
    for (const secret of ['"a"', '"b"', '"c"', "sid=1", "Bearer x", "me@example.com"]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("[redacted]");
  });
});
