import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" output is only for self-hosted (Docker/VM) deploys.
  // Vercel builds natively — leaving it off keeps `vercel build` clean.
  devIndicators: false, // kills the floating Next.js logo / dev tools badge
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
