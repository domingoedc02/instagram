/** Signed-in home. Signed-out visitors are redirected to /login by the middleware. */
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 p-6">
      <p className="text-center text-muted-foreground">
        You&apos;re in. Your feed will appear here once you follow people.
      </p>
    </main>
  );
}
