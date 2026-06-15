"""Reverse proxy for all Taiga API calls.

Taiga self-hosted instances reject browser CORS preflight requests from
third-party origins. This module forwards all Taiga REST calls server-side
so the browser never contacts the Taiga instance directly.
"""

import logging
import os
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel

from backend.app.api.rate_limit import (
    auth_rate_limit,
    check_auth_failures,
    check_username_failures,
    record_auth_failure,
    record_username_failure,
)
from backend.app.api.pm_http import send_with_retry
from backend.app.api.ssrf import is_blocked_host

router = APIRouter()
_logger = logging.getLogger("apex.taiga_proxy")

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


def _egress(target_url: str, headers: dict) -> tuple[str, dict]:
    """Route the request through the Cloudflare relay when configured.

    Taiga Cloud's host firewall-DROPs Azure Container Apps egress IPs, so direct
    connects to api.taiga.io time out (→ 502). When TAIGA_EGRESS_RELAY is set,
    the request is sent to that Worker instead, which forwards to the real
    target from Cloudflare's (non-blocked) network. The real target — already
    SSRF-validated by the caller — travels in X-Relay-Target; X-Relay-Secret
    authenticates the backend to the Worker so it is not an open proxy. Unset
    the env var to fall back to direct egress.
    """
    relay = os.getenv("TAIGA_EGRESS_RELAY", "").strip().rstrip("/")
    if not relay:
        return target_url, headers
    relayed = dict(headers)
    relayed["X-Relay-Target"] = target_url
    secret = os.getenv("TAIGA_EGRESS_RELAY_SECRET", "").strip()
    if secret:
        relayed["X-Relay-Secret"] = secret
    return relay, relayed


def _validate_taiga_url(url: str, *, source: str = "X-Taiga-Url") -> str:
    """Require https:// and a non-private hostname to prevent SSRF.

    Applied to BOTH the X-Taiga-Url header override and the workspace-config
    URL — the config is writable through the API, so it is just as
    user-influenced as the header.
    """
    url = url.strip().rstrip("/")
    if not url.startswith("https://"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{source}: Taiga instance URL must use https://. Use a Cloudflare tunnel for local instances.",
        )
    host = urlparse(url).hostname or ""
    if not host or is_blocked_host(host):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{source} must not point to a private/loopback address.",
        )
    return url


class TaigaAuthRequest(BaseModel):
    username: str
    password: str
    type: str = "normal"


@router.post("/auth")
async def proxy_taiga_auth(
    payload: TaigaAuthRequest,
    request: Request,
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
    _rl: None = Depends(auth_rate_limit),
) -> dict:
    """Forward a Taiga username/password login request server-side to avoid CORS."""
    check_auth_failures(request)
    check_username_failures(payload.username)
    if not x_taiga_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Taiga-Url header is required.",
        )
    base_url = _validate_taiga_url(x_taiga_url)
    target = f"{base_url}/api/v1/auth"
    url, headers = _egress(target, {"Content-Type": "application/json", "Accept": "application/json"})

    try:
        resp = await _send(
            "POST",
            url,
            json={"username": payload.username, "password": payload.password, "type": payload.type},
            headers=headers,
        )
    except httpx.RequestError as exc:
        _logger.error("Taiga auth proxy failed to reach %s: %s", target, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to reach Taiga instance.",
        ) from exc

    data: dict = resp.json() if resp.content else {}
    if not resp.is_success:
        if resp.status_code in (400, 401, 403):
            record_auth_failure(request)
            record_username_failure(payload.username)
        error_msg = (
            data.get("_error_message")
            or data.get("detail")
            or f"Taiga returned {resp.status_code}."
        )
        raise HTTPException(status_code=resp.status_code, detail=error_msg)

    return data


def _get_taiga_url(x_taiga_url: str = "") -> str:
    """Resolve Taiga API base URL from header override or workspace config."""
    if x_taiga_url:
        return _validate_taiga_url(x_taiga_url)
    from src import context_manager

    config = context_manager.load_config()
    if config.get("pm_tool") != "taiga":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace is not configured for Taiga.",
        )
    taiga_url = config.get("taiga_url", "").rstrip("/")
    if not taiga_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Taiga URL is not configured in workspace.",
        )
    # Config URL is the web URL (e.g. https://tree.taiga.io); append /api/v1
    if not taiga_url.endswith("/api/v1"):
        taiga_url = taiga_url.replace("//tree.", "//api.") + "/api/v1"
    return _validate_taiga_url(taiga_url, source="Configured Taiga URL")


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy_taiga(
    path: str,
    request: Request,
    authorization: str = Header(default="", alias="Authorization"),
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
) -> Response:
    """Forward any Taiga REST API call server-side to eliminate browser CORS issues."""
    if not authorization.startswith("Bearer ") or "\r" in authorization or "\n" in authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization: Bearer <token> header required.",
        )
    if len(authorization) > 2_007:  # "Bearer " (7) + 2000-char token max
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid authorization token.",
        )
    base_url = _get_taiga_url(x_taiga_url)
    target_url = f"{base_url}/{path}"
    if request.url.query:
        target_url = f"{target_url}?{request.url.query}"

    body = b"" if request.method in ("GET", "HEAD") else await request.body()
    url, headers = _egress(
        target_url,
        {
            "Authorization": authorization,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-disable-pagination": "True",
        },
    )

    try:
        resp = await _send(
            request.method,
            url,
            headers=headers,
            content=body or None,
        )
    except httpx.RequestError as exc:
        _logger.error("Taiga proxy failed to reach %s: %s", target_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to reach Taiga instance.",
        ) from exc

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )
