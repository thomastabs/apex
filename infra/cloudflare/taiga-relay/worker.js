/**
 * Apex Taiga egress relay (Cloudflare Worker).
 *
 * Why this exists: Taiga Cloud's host (api.taiga.io) firewall-DROPs traffic
 * from Azure Container Apps egress IP ranges, so the apex-backend proxy gets a
 * connect timeout to Taiga (confirmed: in-container TCP connect to
 * 45.84.208.140:443 times out while general egress works). This Worker runs on
 * Cloudflare's (non-Azure) network, which Taiga does NOT block, and forwards
 * the backend's already-SSRF-validated request to the real Taiga host.
 *
 * Contract with the backend (backend/app/api/taiga_proxy.py:_egress):
 *   - Backend POSTs/GETs to this Worker's root URL.
 *   - X-Relay-Target: the full real target URL (e.g. https://api.taiga.io/api/v1/auth).
 *   - X-Relay-Secret: shared secret; must equal env.RELAY_SECRET (set via
 *     `wrangler secret put RELAY_SECRET`). Without it the Worker is an open proxy.
 *
 * The allow-list keeps this from being a general-purpose open relay even if the
 * secret leaks: only https Taiga hosts are forwardable.
 */

const ALLOWED_HOSTS = new Set(["api.taiga.io"]);

// Headers stripped from the request before forwarding to the real Taiga host.
//
// CRITICAL — the x-forwarded-* / cf-* / x-real-ip family: Cloudflare auto-adds
// x-forwarded-for (= the apex-backend's Azure egress IP) on the request into
// this Worker. Because Worker→api.taiga.io is Cloudflare-to-Cloudflare, Taiga's
// edge TRUSTS x-forwarded-for and passes that Azure IP through to Taiga's
// origin, whose firewall DROPs Azure Container Apps ranges — the origin resets
// and Cloudflare returns 520 (unknown_origin_error). The entire point of this
// relay is to present a Cloudflare source IP to Taiga, so these forwarding
// headers MUST be dropped or the Azure IP leaks straight back in and undoes it.
// (Verified: forwarding x-forwarded-for=<Azure IP> → 520; a public IP → 401.)
//
// Framing headers (content-length/transfer-encoding/content-encoding) are
// dropped because the body is rebuffered via arrayBuffer() below, so the
// caller's original framing no longer matches.
const STRIP_HEADERS = [
  "x-relay-target", "x-relay-secret", "host",
  "cf-connecting-ip", "cf-ray", "cf-ipcountry", "cf-visitor", "cf-ew-via", "cf-worker",
  "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip",
  "content-length", "transfer-encoding", "content-encoding",
];

export default {
  async fetch(request, env) {
    // 1. Authenticate the caller (the apex-backend) — fail closed if no secret set.
    if (!env.RELAY_SECRET) {
      return new Response("relay misconfigured: RELAY_SECRET not set", { status: 500 });
    }
    if (request.headers.get("X-Relay-Secret") !== env.RELAY_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    // 2. Resolve + validate the real target.
    const rawTarget = request.headers.get("X-Relay-Target");
    if (!rawTarget) {
      return new Response("missing X-Relay-Target", { status: 400 });
    }
    let target;
    try {
      target = new URL(rawTarget);
    } catch {
      return new Response("bad X-Relay-Target", { status: 400 });
    }
    if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
      return new Response("target host not allowed", { status: 403 });
    }

    // 3. Rebuild outbound headers without the relay-control/hop headers.
    const headers = new Headers(request.headers);
    for (const h of STRIP_HEADERS) headers.delete(h);

    const init = { method: request.method, headers, redirect: "manual" };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.arrayBuffer();
    }

    // 4. Forward to the real Taiga host, with a bounded retry on Cloudflare's
    // own 52x origin errors (520-526), which Taiga's edge flags as retryable.
    // The deterministic 520 cause is fixed above (x-forwarded-for stripping);
    // this retry is belt-and-suspenders for genuine transient origin blips and
    // never fires on normal responses. Non-52x (incl. 4xx auth failures) return
    // immediately.
    const RETRYABLE = new Set([520, 521, 522, 523, 524, 525, 526]);
    let upstream;
    for (let attempt = 0; attempt < 3; attempt++) {
      upstream = await fetch(target.toString(), init);
      if (!RETRYABLE.has(upstream.status)) break;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }

    // upstream.body is the runtime-managed (already decoded) stream, but
    // upstream.headers still describe the ORIGINAL upstream framing. Copying
    // content-length / content-encoding / transfer-encoding verbatim would make
    // the re-emitted response inconsistent with its body, so strip them and let
    // the runtime recompute.
    const respHeaders = new Headers(upstream.headers);
    for (const h of ["content-length", "content-encoding", "transfer-encoding", "connection"]) {
      respHeaders.delete(h);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  },
};
