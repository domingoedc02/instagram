import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-4xl font-semibold tracking-tight">INS</h1>
      <p className="text-center text-muted-foreground">
        Share photos, videos and stories with the people you follow.
      </p>
      <Button disabled>Sign up — coming soon</Button>
    </main>
  );
}
