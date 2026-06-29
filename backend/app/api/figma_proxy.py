"""Reverse proxy for Figma REST API calls.

The Figma REST API does not return permissive CORS headers, so the browser
cannot call it directly with a personal access token. This module forwards all
Figma REST calls server-side. The target host is fixed to api.figma.com, which
is publicly reachable from Azure Container Apps — so, unlike the Taiga proxy,
there is no Cloudflare egress relay; the request is sent directly (DNS-rebinding
pinned). Modelled on taiga_proxy.py.
"""

import logging

import httpx
from fastapi import APIRouter, Header, HTTPException, Request, Response, status

from backend.app.api.pm_http import send_with_retry
from backend.app.api.rate_limit import check_auth_failures, record_auth_failure
from backend.app.api.ssrf import egress_host_allowed, is_blocked_host, pinned_target
from backend.app.services.figma_fetch import figma_auth_headers

router = APIRouter()
_logger = logging.getLogger("apex.figma_proxy")

_FIGMA_HOST = "api.figma.com"
_FIGMA_API_BASE = "https://api.figma.com/v1"
_MAX_TOKEN_LEN = 2_000

_TIMEOUT = 20.0
_CONNECT_TIMEOUT = 8.0  # fail fast on dead egress paths; read keeps the full budget
# Recycle idle keepalive sockets quickly: a connection bound to a dead Azure
# SNAT flow is dropped instead of being reused into a 20s timeout.
_KEEPALIVE_EXPIRY = 15.0
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(_TIMEOUT, connect=_CONNECT_TIMEOUT),
            limits=httpx.Limits(keepalive_expiry=_KEEPALIVE_EXPIRY),
        )
    return _client


async def _reset_client() -> None:
    """Drop the pooled client so the next call starts with fresh connections."""
    global _client
    old, _client = _client, None
    if old is not None and not old.is_closed:
        try:
            await old.aclose()
        except Exception:  # noqa: BLE001 — best-effort cleanup of a dead pool
            pass


async def _send(method: str, url: str, **kwargs) -> httpx.Response:
    """Send with self-heal retry on connect failures (see pm_http)."""
    return await send_with_retry(_get_client, _reset_client, method, url, logger=_logger, **kwargs)


def _pin(url: str, headers: dict) -> tuple[str, dict, dict]:
    """Pin the direct-egress target to a validated IP (DNS-rebinding guard)."""
    try:
        return pinned_target(url, headers)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Figma host resolves to a private/blocked address.",
        ) from exc


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy_figma(
    path: str,
    request: Request,
    x_figma_token: str = Header(default="", alias="X-Figma-Token"),
) -> Response:
    """Forward any Figma REST API call server-side to eliminate browser CORS issues."""
    token = x_figma_token.strip()
    if not token or "\r" in x_figma_token or "\n" in x_figma_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-Figma-Token header required.",
        )
    if len(token) > _MAX_TOKEN_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Figma token.",
        )
    # The token is a credential, so every endpoint doubles as a validity oracle —
    # back off IPs that keep getting rejected upstream.
    check_auth_failures(request)

    # Host is constant, but keep the SSRF guards for parity with the PM proxies
    # and to honour a deployment egress allowlist.
    if is_blocked_host(_FIGMA_HOST):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Figma host resolves to a private/blocked address.",
        )
    if not egress_host_allowed(_FIGMA_HOST):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"host {_FIGMA_HOST!r} is not in the egress allowlist.",
        )

    target_url = f"{_FIGMA_API_BASE}/{path}"
    if request.url.query:
        target_url = f"{target_url}?{request.url.query}"

    body = b"" if request.method in ("GET", "HEAD") else await request.body()
    # The browser always sends the token in X-Figma-Token; forward it under the
    # scheme Figma expects (PAT → X-Figma-Token, OAuth access token → Bearer).
    headers = {**figma_auth_headers(token), "Accept": "application/json"}
    if request.method not in ("GET", "HEAD"):
        headers["Content-Type"] = "application/json"
    url, headers, ext = _pin(target_url, headers)

    try:
        resp = await _send(
            request.method,
            url,
            headers=headers,
            content=body or None,
            **({"extensions": ext} if ext else {}),
        )
    except httpx.RequestError as exc:
        _logger.error("Figma proxy failed to reach %s: %s", target_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to reach Figma.",
        ) from exc

    if resp.status_code in (401, 403):
        record_auth_failure(request)

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )
