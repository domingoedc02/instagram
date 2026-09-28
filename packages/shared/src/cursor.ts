import { z } from "zod";
import { AppError } from "./errors";

/**
 * Opaque keyset cursors (spec/api, Pagination): base64url JSON of `{id}` or `{score,id}`.
 * Decoding validates against a schema, so a tampered cursor is a 400, never a query.
 */
export const idCursor = z.strictObject({ id: z.uuid() });
export const scoreCursor = z.strictObject({ score: z.number().finite(), id: z.uuid() });

export function encodeCursor(
  value: z.input<typeof idCursor> | z.input<typeof scoreCursor>,
): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<S extends z.ZodType>(cursor: string, schema: S): z.output<S> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new AppError("BAD_REQUEST", "Invalid cursor.");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new AppError("BAD_REQUEST", "Invalid cursor.");
  return result.data;
}

/** `limit` query param: default 20, max 50. */
export const pageLimit = z.coerce.number().int().min(1).max(50).default(20);
