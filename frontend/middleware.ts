import { NextResponse, type NextRequest } from "next/server";

/**
 * CSP nonce rollout — phase 1 (observe).
 *
 * Emits a STRICT, nonce-based policy as `Content-Security-Policy-Report-Only`
 * so violations surface in the browser console / prod without blocking
 * anything. The ENFORCED policy stays permissive (next.config.ts) during this
 * phase, so there is zero breakage risk while we confirm the strict policy is
 * clean. Once verified, flip: drop the static enforced CSP for scripts and set
 * this `strict` string as `Content-Security-Policy` here instead.
 *
 * The nonce is also set on the REQUEST `Content-Security-Policy` header so Next
 * applies it to its own framework scripts — that keeps the Report-Only signal
 * clean (only genuinely un-nonced inline scripts violate, not Next's hydration
 * scripts). style-src keeps 'unsafe-inline' because ReactFlow + Tailwind inject
 * inline styles that cannot be nonced in practice (style injection is a far
 * lower-risk XSS sink than script).
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const strict = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' http://localhost:8000 https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", strict);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy-Report-Only", strict);
  return response;
}

export const config = {
  // Run on pages only — skip static assets, optimized images, favicon, and the
  // public /images BPMN SVGs (no CSP benefit, avoids per-asset overhead).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images).*)"],
};
