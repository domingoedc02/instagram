import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@ins/shared", "@ins/email", "@ins/db"],
  // Native bindings are loaded by Node at runtime, never bundled.
  serverExternalPackages: ["@node-rs/argon2"],
  poweredByHeader: false,
  reactStrictMode: true,
  // `pnpm lint` runs ESLint (with boundaries) as its own Turbo task and CI step.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
