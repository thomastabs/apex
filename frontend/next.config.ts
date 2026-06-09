import type { NextConfig } from "next";
import path from "node:path";

const _CSP = [
  "default-src 'self'",
  // Next.js requires unsafe-inline/unsafe-eval for hydration scripts.
  // A nonce-based CSP would remove these but requires middleware.ts setup.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Allow API calls to the FastAPI backend (localhost dev + any HTTPS in prod).
  "connect-src 'self' http://localhost:8000 https:",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
          { key: "Content-Security-Policy", value: _CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
