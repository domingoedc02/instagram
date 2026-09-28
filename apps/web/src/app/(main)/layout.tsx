import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";

/** Signed-in shell. The middleware redirects visitors without a session cookie to /login. */
export default function MainLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <nav
          aria-label="Main"
          className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-2 px-4"
        >
          <Link href="/" className="text-2xl font-semibold tracking-tight">
            INS
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/settings/security"
              className="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
            >
              Security
            </Link>
            <SignOutButton />
          </div>
        </nav>
      </header>
      {children}
    </div>
  );
}
