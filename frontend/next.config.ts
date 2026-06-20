import type { NextConfig } from "next";
import path from "node:path";

// Content-Security-Policy is set per-request in middleware.ts (nonce-based,
// enforced). The other security headers stay here as static response headers.

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Standalone output bundles only traced production deps into
  // .next/standalone — the Docker runner stage copies that instead of the
  // full dev node_modules (cuts the image by roughly 70%).
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd()),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
