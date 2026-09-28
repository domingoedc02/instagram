"use client";

import { emailSchema } from "@ins/shared/schemas/auth";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { postJson } from "@/lib/api-client";
import { readPendingEmail } from "@/lib/pending-email";

type State =
  { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

/**
 * Asks for a new verification link. The API answers 204 whether or not the address has an
 * account (AC-9), so the confirmation is worded the same either way.
 */
export function ResendVerificationForm({ label = "Send a new link" }: { label?: string }) {
  const [remembered, setRemembered] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [state, setState] = useState<State>({ kind: "idle" });

  // sessionStorage exists only in the browser, so read it after hydration.
  useEffect(() => setRemembered(readPendingEmail()), []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "sending") return;
    const parsed = emailSchema.safeParse(remembered ?? email);
    if (!parsed.success) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setFieldError(undefined);
    setState({ kind: "sending" });
    const res = await postJson("/api/v1/auth/resend-verification", { email: parsed.data });
    if (res.ok) setState({ kind: "sent" });
    else if (res.error.code === "RATE_LIMITED")
      setState({
        kind: "error",
        message: "You've asked for several links already. Try again in an hour.",
      });
    else setState({ kind: "error", message: res.error.message });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
      {remembered ? null : (
        <Field
          id="resend-email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError}
        />
      )}
      <Button
        type="submit"
        variant="outline"
        disabled={state.kind === "sending"}
        aria-busy={state.kind === "sending"}
      >
        {state.kind === "sending" ? "Sending…" : label}
      </Button>
      <p role="status" className="text-sm text-muted-foreground empty:hidden">
        {state.kind === "sent"
          ? "If that address has an account waiting for confirmation, a new link is on its way. Earlier links no longer work."
          : null}
        {state.kind === "error" ? <span className="text-destructive">{state.message}</span> : null}
      </p>
    </form>
  );
}
