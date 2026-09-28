import { AppError } from "@ins/shared/errors";
import { z } from "zod";
import { withApi } from "@/server/http/with-api";

// Exercises the pipeline end to end; returns 404 in production.
export const dynamic = "force-dynamic";

const notInProduction = () => {
  if (process.env.NODE_ENV === "production") throw new AppError("NOT_FOUND", "Not found.");
};

export const GET = withApi(
  {
    auth: "none",
    rateLimit: "search",
    query: z.object({ fail: z.enum(["app", "crash"]).optional() }),
  },
  async (ctx, { query }) => {
    notInProduction();
    if (query.fail === "app")
      throw new AppError("CONFLICT", "Example conflict.", { reason: "demo" });
    if (query.fail === "crash") throw new Error("secret internal detail: db password=hunter2");
    return { pong: true, requestId: ctx.requestId };
  },
);

export const POST = withApi(
  {
    auth: "none",
    body: z.object({ message: z.string().min(1).max(100), count: z.number().int().positive() }),
  },
  async (_ctx, { body }) => {
    notInProduction();
    return Response.json({ echo: body.message, count: body.count }, { status: 201 });
  },
);
