import { signInSchema } from "@ins/shared/schemas/auth";
import { signIn } from "@/server/auth/sign-in.service";
import { authRequest, withApi } from "@/server/http/with-api";

/**
 * UF-2 sign-in by email or username. 200 `{user}` + the session cookie; 401 is the same body
 * for every wrong password and unknown identifier, 423 the same for every lock (INS-23).
 */
export const POST = withApi(
  { auth: "none", rateLimit: "auth-sign-in", body: signInSchema },
  async (ctx, { body }) => {
    const result = await signIn(body, authRequest(ctx));
    return Response.json(
      { user: result.user },
      { headers: { "Set-Cookie": result.setCookie, "Cache-Control": "no-store" } },
    );
  },
);
