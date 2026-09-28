/** Signed-in home. Signed-out visitors are redirected to /login by the middleware. */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-4xl font-semibold tracking-tight">INS</h1>
      <p className="text-center text-muted-foreground">
        You&apos;re in. Your feed will appear here once you follow people.
      </p>
    </main>
  );
}
