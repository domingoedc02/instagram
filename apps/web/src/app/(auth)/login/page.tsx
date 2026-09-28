import { safeNextPath } from "@ins/shared/schemas/auth";
import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;

  return (
    <section aria-labelledby="login-title" className="flex flex-col gap-6">
      <h1 id="login-title" className="text-center text-xl font-semibold">
        Log in to INS
      </h1>
      <LoginForm next={safeNextPath(next)} />
      <p className="text-center text-sm">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium underline underline-offset-2">
          Sign up
        </Link>
      </p>
    </section>
  );
}
