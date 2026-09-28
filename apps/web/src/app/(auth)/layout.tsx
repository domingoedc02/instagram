import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <Link href="/" className="self-center text-3xl font-semibold tracking-tight">
        INS
      </Link>
      {children}
    </main>
  );
}
