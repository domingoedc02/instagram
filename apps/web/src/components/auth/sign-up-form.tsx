"use client";

import { maskEmail, signUpSchema, usernameSchema } from "@ins/shared/schemas/auth";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { firstFieldErrors, getJson, postJson, type ApiError } from "@/lib/api-client";
import { rememberPendingEmail } from "@/lib/pending-email";

type FieldName = "email" | "name" | "username" | "password" | "birthdate";
type FieldErrors = Partial<Record<FieldName, string>>;
type UsernameState = "idle" | "checking" | "available" | "taken" | "invalid";

const FIELD_ORDER: FieldName[] = ["email", "name", "username", "password", "birthdate"];
const USERNAME_DEBOUNCE_MS = 300;

/** Error codes the sign-up API can return, as the visitor should read them. */
function describe(error: ApiError): { form?: string; fields?: FieldErrors } {
  switch (error.code) {
    case "AGE_REQUIREMENT_NOT_MET":
      return { form: "Sorry, you need to be at least 13 to use INS." };
    case "PASSWORD_BREACHED":
      return {
        fields: {
          password:
            "This password has appeared in a data breach. Choose one you haven't used elsewhere.",
        },
      };
    case "USERNAME_TAKEN":
      return { fields: { username: "This username is taken. Try another." } };
    case "VALIDATION_FAILED":
      return { form: "Check the highlighted fields.", fields: firstFieldErrors(error) };
    case "RATE_LIMITED":
      return { form: "Too many sign-up attempts from this network. Try again in a while." };
    default:
      return { form: error.message };
  }
}

function clientErrors(values: Record<FieldName, string>): FieldErrors {
  const result = signUpSchema.safeParse(values);
  if (result.success) return {};
  const flat = z.flattenError(result.error).fieldErrors as Partial<Record<FieldName, string[]>>;
  const out: FieldErrors = {};
  for (const name of FIELD_ORDER) {
    const first = flat[name]?.[0];
    if (first) out[name] = first;
  }
  return out;
}

export function SignUpForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<FieldName, string>>({
    email: "",
    name: "",
    username: "",
    password: "",
    birthdate: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState<UsernameState>("idle");

  // Debounced availability check; a newer keystroke aborts the older request.
  useEffect(() => {
    const raw = values.username.trim();
    if (!raw) {
      setUsername("idle");
      return;
    }
    if (!usernameSchema.safeParse(raw).success) {
      setUsername("invalid");
      return;
    }
    setUsername("checking");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const res = await getJson<{ available: boolean }>(
        `/api/v1/auth/username-available?u=${encodeURIComponent(raw)}`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setUsername(res.ok ? (res.data.available ? "available" : "taken") : "idle");
    }, USERNAME_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [values.username]);

  function update(name: FieldName, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  }

  function focusFirstInvalid(fields: FieldErrors) {
    const first = FIELD_ORDER.find((name) => fields[name]);
    if (first) formRef.current?.querySelector<HTMLInputElement>(`#signup-${first}`)?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);

    const local = clientErrors(values);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      setFormError("Check the highlighted fields.");
      focusFirstInvalid(local);
      return;
    }

    setSubmitting(true);
    const res = await postJson("/api/v1/auth/sign-up", values);
    if (res.ok) {
      const email = values.email.trim().toLowerCase();
      rememberPendingEmail(email);
      router.push(`/check-inbox?email=${encodeURIComponent(maskEmail(email))}`);
      return;
    }
    setSubmitting(false);
    const { form, fields = {} } = describe(res.error);
    setErrors(fields);
    setFormError(form ?? null);
    focusFirstInvalid(fields);
  }

  const usernameStatus: Record<UsernameState, string> = {
    idle: "",
    checking: "Checking…",
    available: "✓ Available",
    taken: "This username is taken.",
    invalid: "",
  };

  return (
    <form ref={formRef} noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <div role="alert" aria-live="assertive" className="empty:hidden">
        {formError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {formError}
          </p>
        ) : null}
      </div>

      <Field
        id="signup-email"
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        required
        value={values.email}
        onChange={(e) => update("email", e.target.value)}
        error={errors.email}
      />
      <Field
        id="signup-name"
        label="Full name"
        name="name"
        autoComplete="name"
        required
        maxLength={64}
        value={values.name}
        onChange={(e) => update("name", e.target.value)}
        error={errors.name}
      />
      <Field
        id="signup-username"
        label="Username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={30}
        hint="3–30 characters: letters, numbers, periods and underscores."
        status={
          <span className={username === "taken" ? "text-destructive" : "text-muted-foreground"}>
            {usernameStatus[username]}
          </span>
        }
        value={values.username}
        onChange={(e) => update("username", e.target.value)}
        error={errors.username}
      />
      <Field
        id="signup-password"
        label="Password"
        name="password"
        type={showPassword ? "text" : "password"}
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={128}
        hint="At least 10 characters. A few unrelated words work well."
        value={values.password}
        onChange={(e) => update("password", e.target.value)}
        error={errors.password}
        trailing={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={showPassword}
            aria-controls="signup-password"
            onClick={() => setShowPassword((s) => !s)}
          >
            {showPassword ? "Hide" : "Show"}
          </Button>
        }
      />
      <Field
        id="signup-birthdate"
        label="Birthday"
        name="birthdate"
        type="date"
        autoComplete="bday"
        required
        max={new Date().toISOString().slice(0, 10)}
        hint="You need to be at least 13. This won't be shown on your profile."
        value={values.birthdate}
        onChange={(e) => update("birthdate", e.target.value)}
        error={errors.birthdate}
      />

      <Button type="submit" size="lg" disabled={submitting} aria-busy={submitting}>
        {submitting ? "Creating your account…" : "Sign up"}
      </Button>
    </form>
  );
}
