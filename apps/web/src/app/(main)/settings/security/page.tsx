import type { Metadata } from "next";
import { SessionsList } from "@/components/settings/sessions-list";

export const metadata: Metadata = { title: "Security" };

export default function SecuritySettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold">Security</h1>
      <section aria-labelledby="sessions-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="sessions-title" className="text-lg font-medium">
            Where you&apos;re logged in
          </h2>
          <p className="text-sm text-muted-foreground">
            If you don&apos;t recognize a session, log it out and change your password.
          </p>
        </div>
        <SessionsList />
      </section>
    </main>
  );
}
