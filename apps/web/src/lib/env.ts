import "server-only";
import { z } from "zod";
import {
  baseEnv,
  emailEnv,
  envBool,
  envList,
  parseEnv,
  requireMailTransport,
  s3Env,
  secret,
} from "@ins/shared/env";

const schema = baseEnv
  .extend(s3Env.shape)
  .extend(emailEnv.shape)
  .extend({
    APP_URL: z.url(),
    ALLOWED_ORIGINS: envList,
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: z.url(),
    HIBP_ENABLED: envBool,
    REALTIME_JWT_SECRET: secret,
  })
  .superRefine(requireMailTransport);

export type ServerEnv = z.output<typeof schema>;

// `next build` imports route modules to collect page data; secrets are only required at runtime,
// where src/instrumentation.ts validates before the first request.
const isBuild = process.env.NEXT_PHASE === "phase-production-build";

export const env: ServerEnv = isBuild ? (process.env as unknown as ServerEnv) : parseEnv(schema);
