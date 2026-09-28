import { z } from "zod";
import { baseEnv, envList, parseEnvOrExit, secret } from "@ins/shared/env";

const schema = baseEnv.extend({
  REDIS_URL: z.url(),
  ALLOWED_ORIGINS: envList,
  REALTIME_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  REALTIME_JWT_SECRET: secret,
  // Set during a key rotation so tokens signed with the old secret keep verifying.
  REALTIME_JWT_SECRET_PREVIOUS: secret.optional(),
});

export const env = parseEnvOrExit(schema, "realtime");
