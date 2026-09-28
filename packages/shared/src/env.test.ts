import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EnvError, baseEnv, envBool, envList, parseEnv, secret } from "./env";

const schema = baseEnv.extend({
  APP_URL: z.url(),
  SECRET: secret,
  FLAG: envBool,
  ORIGINS: envList,
});

describe("parseEnv", () => {
  it("parses and applies defaults", () => {
    const env = parseEnv(schema, {
      APP_URL: "http://localhost:3000",
      SECRET: "x".repeat(32),
      ORIGINS: "http://a.test, http://b.test",
    });
    expect(env).toMatchObject({ NODE_ENV: "development", FLAG: false });
    expect(env.ORIGINS).toEqual(["http://a.test", "http://b.test"]);
  });

  it("lists every invalid variable by name without echoing values", () => {
    const run = () =>
      parseEnv(schema, { APP_URL: "nope", SECRET: "short-secret-value", ORIGINS: "" });
    expect(run).toThrow(EnvError);
    try {
      run();
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("APP_URL");
      expect(msg).toContain("SECRET");
      expect(msg).toContain("ORIGINS");
      expect(msg).not.toContain("short-secret-value");
    }
  });
});
