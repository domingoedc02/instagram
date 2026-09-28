import { z } from "zod";
import { baseEnv, emailEnv, parseEnvOrExit, requireMailTransport, s3Env } from "@ins/shared/env";

const schema = baseEnv
  .extend(s3Env.shape)
  .extend(emailEnv.shape)
  .extend({
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    APP_URL: z.url(),
    WORKER_CONCURRENCY_MEDIA: z.coerce.number().int().min(1).max(16).default(2),
    NSFW_REJECT_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
    NSFW_REVIEW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  })
  .superRefine(requireMailTransport)
  .refine((env) => env.NSFW_REVIEW_THRESHOLD < env.NSFW_REJECT_THRESHOLD, {
    path: ["NSFW_REVIEW_THRESHOLD"],
    message: "must be lower than NSFW_REJECT_THRESHOLD",
  });

export const env = parseEnvOrExit(schema, "worker");
