"use client";

import { maskEmail } from "@ins/shared/schemas/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { postJson, type ApiError } from "@/lib/api-client";
import { rememberPendingEmail } from "@/lib/pending-email";

const link = "font-medium underline underline-offset-2";

function formatUntil(until: unknown): string | null {
  if (typeof until !== "string") return null;
  const date = new Date(until);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
}

/** Sign-in error codes, as the visitor should read them (INS-23 API table). */
function describe(error: ApiError, identifier: string): ReactNode {
  switch (error.code) {
    case "INVALID_CREDENTIALS":
      return "Incorrect email, username or password.";
    case "ACCOUNT_LOCKED":
      return (
        <>
          Too many incorrect attempts. Try again in 15 minutes or{" "}
          <Link href="/forgot-password" className={link}>
            reset your password
          </Link>
          .
        </>
      );
    case "ACCOUNT_SUSPENDED": {
      const until = formatUntil((error.details as { until?: unknown } | undefined)?.until);
      return until ? `Your account is suspended until ${until}.` : "Your account is suspended.";
    }
    case "EMAIL_NOT_VERIFIED": {
      const email = identifier.includes("@") ? identifier : null;
      const href = email
        ? `/check-inbox?email=${encodeURIComponent(maskEmail(email))}`
        : "/check-inbox";
      return (
        <>
          Confirm your email to log in.{" "}
          <Link href={href} className={link}>
            Send a new confirmation link
          </Link>
          .
        </>
      );
    }
    case "VALIDATION_FAILED":
      return "Enter your email or username and your password.";
    case "RATE_LIMITED":
      return "Too many login attempts from this network. Try again in a while.";
    default:
      return error.message;
  }
}

/** UF-2 login. `next` has already been checked with `safeNextPath` on the server (AC-11). */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const alertRef = useRef<HTMLDivElement>(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<ReactNode>(null);
  const [missing, setMissing] = useState<{ identifier?: string; password?: string }>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const normalized = identifier.trim().toLowerCase();
    const local = {
      ...(normalized ? {} : { identifier: "Enter your email or username." }),
      ...(password ? {} : { password: "Enter your password." }),
    };
    setMissing(local);
    if (local.identifier || local.password) {
      setFormError(null);
      document.getElementById(local.identifier ? "login-identifier" : "login-password")?.focus();
      return;
    }

    setSubmitting(true);
    setFormError(null);
    const res = await postJson("/api/v1/auth/sign-in", { identifier: normalized, password });
    if (res.ok) {
      router.replace(next);
      router.refresh();
      return;
    }
    setSubmitting(false);
    if (res.error.code === "EMAIL_NOT_VERIFIED" && normalized.includes("@")) {
      rememberPendingEmail(normalized);
    }
    if (res.error.code === "INVALID_CREDENTIALS") setPassword("");
    setFormError(describe(res.error, normalized));
    alertRef.current?.focus();
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <div
        ref={alertRef}
        tabIndex={-1}
        role="alert"
        aria-live="assertive"
        className="outline-none empty:hidden"
      >
        {formError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {formError}
          </p>
        ) : null}
      </div>

      <Field
        id="login-identifier"
        label="Email or username"
        name="identifier"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={254}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        error={missing.identifier}
      />
      <Field
        id="login-password"
        label="Password"
        name="password"
        type={showPassword ? "text" : "password"}
        autoComplete="current-password"
        required
        maxLength={128}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={missing.password}
        trailing={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={showPassword}
            aria-controls="login-password"
            onClick={() => setShowPassword((s) => !s)}
          >
            {showPassword ? "Hide" : "Show"}
          </Button>
        }
      />

      <Button type="submit" size="lg" disabled={submitting} aria-busy={submitting}>
        {submitting ? "Logging in…" : "Log in"}
      </Button>
      <Link href="/forgot-password" className="self-center text-sm underline underline-offset-2">
        Forgot password?
      </Link>
    </form>
  );
}
