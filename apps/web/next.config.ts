import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@ins/shared", "@ins/email"],
  poweredByHeader: false,
  reactStrictMode: true,
  // `pnpm lint` runs ESLint (with boundaries) as its own Turbo task and CI step.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
