/** Browser-side calls to our own `/api/v1` routes (spec/api error envelope). */

export interface ApiError {
  code: string;
  message: string;
  details?: { fieldErrors?: Record<string, string[] | undefined> } | undefined;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiError };

const NETWORK_ERROR: ApiError = {
  code: "NETWORK",
  message: "We couldn't reach INS. Check your connection and try again.",
};

async function call<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }
  let body: unknown;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined; // e.g. an HTML error page from a proxy
  }
  if (res.ok) return { ok: true, data: body as T };
  const error = (body as { error?: ApiError } | undefined)?.error;
  return {
    ok: false,
    status: res.status,
    error: error ?? { code: "INTERNAL", message: "Something went wrong. Try again." },
  };
}

export function postJson<T = unknown>(path: string, body: unknown, signal?: AbortSignal) {
  return call<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
}

export function getJson<T = unknown>(path: string, signal?: AbortSignal) {
  return call<T>(path, signal ? { signal } : {});
}

/** The first message for each field, from a VALIDATION_FAILED-style `details.fieldErrors`. */
export function firstFieldErrors(error: ApiError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(error.details?.fieldErrors ?? {})) {
    if (messages?.[0]) out[field] = messages[0];
  }
  return out;
}
