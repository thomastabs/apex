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

// Hop-by-hop / relay-control headers stripped before forwarding upstream.
const STRIP_HEADERS = ["x-relay-target", "x-relay-secret", "host", "cf-connecting-ip", "cf-ray", "cf-ipcountry"];

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

    // 4. Forward and stream the upstream response straight back.
    const upstream = await fetch(target.toString(), init);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  },
};
