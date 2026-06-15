# Apex Taiga egress relay

A Cloudflare Worker that forwards the apex-backend's Taiga API calls to
`api.taiga.io` from Cloudflare's network.

## Why

Taiga Cloud's host firewall **DROPs** traffic from Azure Container Apps egress
IP ranges. Confirmed from inside the running `apex-backend` container:

| Test | Result |
|------|--------|
| General egress (ipify) | OK — egress IP `20.74.94.128` |
| Taiga IPv4 `45.84.208.140:443` | **timeout 8s** (silent drop) |
| Taiga IPv6 `2a0e:a180::140:443` | `ENETUNREACH` (Azure has no v6 route) |

So `POST /api/pm/taiga/auth` returns **502** after ~25s (8s connect timeout ×
self-heal retries). It is not a code bug and not an IPv6 issue — Taiga blocks
the Azure range. Cloudflare's network is not blocked, so the backend reaches
Taiga *through* this Worker.

## Deploy

```bash
cd infra/cloudflare/taiga-relay
npm install -g wrangler        # if not installed
wrangler login
# Set the shared secret (generate one, e.g. openssl rand -hex 32):
wrangler secret put RELAY_SECRET
wrangler deploy
```

`wrangler deploy` prints the Worker URL, e.g.
`https://apex-taiga-relay.<subdomain>.workers.dev`.

## Wire the backend

Set two env vars on the `apex-backend` Container App:

```bash
az containerapp update -n apex-backend -g apex-rg \
  --set-env-vars \
    TAIGA_EGRESS_RELAY="https://apex-taiga-relay.<subdomain>.workers.dev" \
    TAIGA_EGRESS_RELAY_SECRET="<the same value you put in RELAY_SECRET>"
```

When `TAIGA_EGRESS_RELAY` is set, the proxy
(`backend/app/api/taiga_proxy.py:_egress`) sends every Taiga request to the
Worker with the real (already SSRF-validated) target in `X-Relay-Target` and
the secret in `X-Relay-Secret`. Unset the var to go back to direct egress.

## Security

- The Worker fails closed: no `RELAY_SECRET` → HTTP 500.
- Wrong/absent `X-Relay-Secret` → HTTP 403, so it is not an open proxy.
- `ALLOWED_HOSTS` allow-lists `api.taiga.io` only — even with the secret it
  cannot be used as a general relay. Add hosts there if you self-host Taiga.
- The backend still runs its own SSRF guard on the real target *before*
  relaying, so the allow-list is defence-in-depth.
