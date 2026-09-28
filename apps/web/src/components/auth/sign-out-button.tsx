"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/api-client";

/** UF-2 step 11. A 401 means the session is already gone, which is the outcome we want. */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    const res = await postJson("/api/v1/auth/sign-out", {});
    if (!res.ok && res.status !== 401) {
      setPending(false);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={signOut} disabled={pending} aria-busy={pending}>
      {pending ? "Logging out…" : "Log out"}
    </Button>
  );
}
