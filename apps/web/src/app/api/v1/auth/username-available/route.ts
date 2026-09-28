import { usernameAvailableQuery, usernameSchema } from "@ins/shared/schemas/auth";
import { isUsernameAvailable } from "@/server/auth/sign-up.service";
import { withApi } from "@/server/http/with-api";

/** Debounced from the sign-up form. A malformed name is simply unavailable. */
export const GET = withApi(
  { auth: "none", rateLimit: "auth-username-available", query: usernameAvailableQuery },
  async (_ctx, { query }) => {
    const parsed = usernameSchema.safeParse(query.u);
    return { available: parsed.success && (await isUsernameAvailable(parsed.data)) };
  },
);
