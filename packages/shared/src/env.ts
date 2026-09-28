import { z } from "zod";

/** Thrown when the process environment does not match its schema. Lists names, never values. */
export class EnvError extends Error {
  override name = "EnvError";
}

/**
 * Validates `source` against `schema`. Empty strings count as unset, so `FOO=` in a .env file
 * behaves like a missing variable and optional fields stay optional.
 */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
): z.output<T> {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ""));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    throw new EnvError(`Invalid environment variables:\n${lines.join("\n")}`);
  }
  return result.data;
}

/** For long-running Node services: print the problem and exit 1 instead of a stack trace. */
export function parseEnvOrExit<T extends z.ZodType>(schema: T, service: string): z.output<T> {
  try {
    return parseEnv(schema);
  } catch (err) {
    if (!(err instanceof EnvError)) throw err;
    process.stderr.write(`[${service}] ${err.message}\n`);
    process.exit(1);
  }
}

export const envBool = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

export const envList = z
  .string()
  .transform((s) =>
    s
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()).min(1));

export const secret = z
  .string()
  .min(32, "must be at least 32 characters (openssl rand -base64 32)");

export const baseEnv = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  SENTRY_DSN: z.url().optional(),
});

export const s3Env = z.object({
  S3_ENDPOINT: z.url(),
  S3_PUBLIC_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET_UPLOADS: z.string().min(1),
  S3_BUCKET_MEDIA: z.string().min(1),
  S3_BUCKET_EXPORTS: z.string().min(1),
});

export const emailEnv = z.object({
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(3),
  SMTP_URL: z.url().optional(),
});

/** Production sends through Resend; everywhere else needs an SMTP sink such as Mailpit. */
export function requireMailTransport(
  env: { NODE_ENV: string; RESEND_API_KEY?: string | undefined; SMTP_URL?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (env.NODE_ENV === "production" && !env.RESEND_API_KEY) {
    ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "required in production" });
  }
  if (env.NODE_ENV !== "production" && !env.RESEND_API_KEY && !env.SMTP_URL) {
    ctx.addIssue({
      code: "custom",
      path: ["SMTP_URL"],
      message: "required when RESEND_API_KEY is unset",
    });
  }
}
