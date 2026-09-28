import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";

export const metadata: Metadata = { title: "Confirm your email", referrer: "no-referrer" };

/**
 * The emailed link lands here. It hands the token straight to the API route, which verifies it,
 * sets the session cookie and redirects home — or back here with `status=invalid`.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; status?: string | string[] }>;
}) {
  const { token, status } = await searchParams;
  if (typeof token === "string" && token) {
    redirect(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`);
  }

  if (status === "invalid") {
    return (
      <section aria-labelledby="verify-title" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 id="verify-title" className="text-xl font-semibold">
            This link has expired or was already used
          </h1>
          <p className="text-sm text-muted-foreground">
            Confirmation links work once and last 24 hours. Enter your email and we&apos;ll send a
            new one.
          </p>
        </div>
        <ResendVerificationForm />
      </section>
    );
  }

  return (
    <section aria-labelledby="verify-title" className="flex flex-col gap-4 text-center">
      <h1 id="verify-title" className="text-xl font-semibold">
        Confirm your email
      </h1>
      <p className="text-sm text-muted-foreground">
        Open the link we emailed you to confirm your address.
      </p>
      <Link href="/signup" className="text-sm font-medium underline underline-offset-2">
        Back to sign up
      </Link>
    </section>
  );
}
