import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <section aria-labelledby="signup-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 id="signup-title" className="text-xl font-semibold">
          Create your account
        </h1>
        <p className="text-sm text-muted-foreground">
          Share photos and videos with the people you follow.
        </p>
      </div>
      <SignUpForm />
      <p className="text-center text-xs text-muted-foreground">
        By signing up you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-2">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>
      <p className="text-center text-sm">
        Have an account?{" "}
        <Link href="/login" className="font-medium underline underline-offset-2">
          Log in
        </Link>
      </p>
    </section>
  );
}
