"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteJson, getJson, postJson } from "@/lib/api-client";

interface SessionItem {
  id: string;
  device: string;
  ip: string;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: SessionItem[] };

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** UF-2 step 12: the caller's sessions, with per-session and bulk revoke (AC-10, AC-12). */
export function SessionsList() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getJson<{ items: SessionItem[] }>("/api/v1/me/sessions");
    if (res.ok) setState({ kind: "ready", items: res.data.items });
    else if (res.status === 401) router.replace("/login?next=/settings/security");
    else setState({ kind: "error", message: res.error.message });
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(item: SessionItem) {
    setBusy(item.id);
    setNotice(null);
    const res = await deleteJson(`/api/v1/me/sessions/${item.id}`);
    setBusy(null);
    if (item.current && (res.ok || res.status === 401)) {
      router.replace("/login");
      router.refresh();
      return;
    }
    setNotice(res.ok || res.status === 404 ? `Logged out ${item.device}.` : res.error.message);
    await load();
  }

  async function revokeOthers() {
    setBusy("others");
    setNotice(null);
    const res = await postJson<{ revoked: number }>("/api/v1/me/sessions/revoke-others", {});
    setBusy(null);
    setNotice(
      res.ok
        ? `Logged out ${res.data.revoked} other ${res.data.revoked === 1 ? "session" : "sessions"}.`
        : res.error.message,
    );
    await load();
  }

  if (state.kind === "loading") {
    return <p className="text-sm text-muted-foreground">Loading sessions…</p>;
  }
  if (state.kind === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.message}
      </p>
    );
  }

  const others = state.items.filter((s) => !s.current).length;
  return (
    <div className="flex flex-col gap-4">
      <p aria-live="polite" className="text-sm empty:hidden">
        {notice}
      </p>
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {state.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {item.device}
                {item.current ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal">
                    This device
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.ip} · Last active {when(item.lastActiveAt)}
              </p>
              <p className="text-xs text-muted-foreground">Signed in {when(item.createdAt)}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => revoke(item)}
              disabled={busy !== null}
              aria-busy={busy === item.id}
              aria-label={`Log out ${item.current ? "this device" : item.device}`}
            >
              Log out
            </Button>
          </li>
        ))}
      </ul>
      <Button
        variant="destructive"
        className="self-start"
        onClick={revokeOthers}
        disabled={busy !== null || others === 0}
        aria-busy={busy === "others"}
      >
        Log out all other sessions
      </Button>
    </div>
  );
}
