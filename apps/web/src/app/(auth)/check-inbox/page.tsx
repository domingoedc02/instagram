import type { Metadata } from "next";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";

export const metadata: Metadata = { title: "Check your inbox" };

/** Only the masked address (`m***@example.com`) travels in the URL. */
const MASKED = /^[^\s@]\*\*\*@[^\s@]{1,253}$/;

export default async function CheckInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const { email } = await searchParams;
  const masked = typeof email === "string" && MASKED.test(email) ? email : null;

  return (
    <section aria-labelledby="inbox-title" className="flex flex-col gap-6 text-center">
      <h1 id="inbox-title" className="text-xl font-semibold">
        Check your inbox
      </h1>
      <p className="text-sm text-muted-foreground">
        We sent a confirmation link to{" "}
        {masked ? <strong className="text-foreground">{masked}</strong> : "your email"}. Open it
        within 24 hours to finish signing up.
      </p>
      <p className="text-sm text-muted-foreground">
        Can&apos;t find it? Check your spam folder, or:
      </p>
      <div className="text-left">
        <ResendVerificationForm />
      </div>
    </section>
  );
}
