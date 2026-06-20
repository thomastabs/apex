import { NextResponse, type NextRequest } from "next/server";

/**
 * CSP nonce — phase 2 (enforce).
 *
 * Emits a strict, nonce-based policy as the ENFORCED `Content-Security-Policy`:
 * `script-src 'self' 'nonce-{x}' 'strict-dynamic'` removes 'unsafe-inline' and
 * 'unsafe-eval', the two big XSS vectors. The nonce is set on the request CSP
 * header so Next injects it into its own <script> tags; `force-dynamic` in
 * app/layout.tsx ensures every page is rendered per request so the nonce
 * actually lands (static prerender would bake nonce-less scripts).
 *
 * style-src keeps 'unsafe-inline' because ReactFlow + Tailwind inject inline
 * styles that cannot be nonced in practice (style injection is a far
 * lower-risk XSS sink than script). The static CSP in next.config.ts was
 * removed so this middleware is the single source of the policy.
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isProd = process.env.NODE_ENV === "production";

  // Dev (next dev) needs 'unsafe-inline'/'unsafe-eval' for React Fast Refresh /
  // HMR, and the Playwright harness injects an init script — a strict nonce CSP
  // breaks both. So enforce the strict nonce policy ONLY in production; dev gets
  // the permissive policy. force-dynamic (app/layout.tsx) makes the prod nonce
  // land in Next's scripts.
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  const policy = [
    "default-src 'self'",
    scriptSrc,
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
  if (isProd) requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Run on pages only — skip static assets, optimized images, favicon, and the
  // public /images BPMN SVGs (no CSP benefit, avoids per-asset overhead).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images).*)"],
};
