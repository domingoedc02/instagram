import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "INS", template: "%s · INS" },
  description: "Share photos, videos and stories with the people you follow.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // A per-request CSP nonce needs dynamic rendering; reading headers opts every page in. Next
  // nonces its own scripts from the forwarded CSP; our <Script>s read `x-nonce` the same way.
  await headers();
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
