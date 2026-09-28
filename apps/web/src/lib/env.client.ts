import { z } from "zod";
import { parseEnv } from "@ins/shared/env";

// NEXT_PUBLIC_* values are inlined at build time, so each must be referenced by its full name.
const schema = z.object({
  NEXT_PUBLIC_REALTIME_URL: z.url(),
  NEXT_PUBLIC_MEDIA_BASE_URL: z.url(),
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
});

export const clientEnv = parseEnv(schema, {
  NEXT_PUBLIC_REALTIME_URL: process.env.NEXT_PUBLIC_REALTIME_URL,
  NEXT_PUBLIC_MEDIA_BASE_URL: process.env.NEXT_PUBLIC_MEDIA_BASE_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});
