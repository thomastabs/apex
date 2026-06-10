"""Reverse proxy for all Taiga API calls.

Taiga self-hosted instances reject browser CORS preflight requests from
third-party origins. This module forwards all Taiga REST calls server-side
so the browser never contacts the Taiga instance directly.
"""

import ipaddress
import logging
import os
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from pydantic import BaseModel

# Set APEX_ALLOW_HTTP_LOCALHOST=true in .env to allow http://localhost Taiga instances in local dev.
_ALLOW_HTTP_LOCALHOST: bool = os.getenv("APEX_ALLOW_HTTP_LOCALHOST", "").lower() in ("1", "true", "yes")

router = APIRouter()
_logger = logging.getLogger("apex.taiga_proxy")

_TIMEOUT = 20.0
_client: httpx.AsyncClient | None = None

# RFC-1918, loopback, link-local, CGNAT, IPv6 ULA, IPv4-mapped
_BLOCKED_NETS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("::ffff:0:0/96"),
]


def _is_blocked_host(host: str) -> bool:
    if host.lower() == "localhost":
        return True
    try:
        addr = ipaddress.ip_address(host)
        return any(addr in net for net in _BLOCKED_NETS)
    except ValueError:
        return False


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(follow_redirects=False, timeout=_TIMEOUT)
    return _client


def _validate_taiga_url(url: str) -> str:
    """Require https:// and a non-private hostname to prevent SSRF.

    Exception: when APEX_ALLOW_HTTP_LOCALHOST=true, http://localhost:<port> is permitted
    for local development against a self-hosted Taiga running on the same machine.
    """
    url = url.strip().rstrip("/")
    host = urlparse(url).hostname or ""
    parsed_is_localhost = host.lower() in ("localhost", "127.0.0.1", "::1")

    if _ALLOW_HTTP_LOCALHOST and parsed_is_localhost:
        # Local dev bypass — allow http://localhost:* only
        if not url.startswith(("http://localhost", "http://127.0.0.1", "http://[::1]")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="APEX_ALLOW_HTTP_LOCALHOST only permits http://localhost URLs.",
            )
        return url

    if not url.startswith("https://"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Taiga instance URL must use https://. For local dev set APEX_ALLOW_HTTP_LOCALHOST=true.",
        )
    if not host or _is_blocked_host(host):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Taiga-Url must not point to a private/loopback address.",
        )
    return url


class TaigaAuthRequest(BaseModel):
    username: str
    password: str
    type: str = "normal"


@router.post("/auth")
async def proxy_taiga_auth(
    payload: TaigaAuthRequest,
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
) -> dict:
    """Forward a Taiga username/password login request server-side to avoid CORS."""
    if not x_taiga_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Taiga-Url header is required.",
        )
    base_url = _validate_taiga_url(x_taiga_url)
    target = f"{base_url}/api/v1/auth"

    try:
        resp = await _get_client().post(
            target,
            json={"username": payload.username, "password": payload.password, "type": payload.type},
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
    except httpx.RequestError as exc:
        _logger.error("Taiga auth proxy failed to reach %s: %s", target, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to reach Taiga instance.",
        ) from exc

    data: dict = resp.json() if resp.content else {}
    if not resp.is_success:
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
    if taiga_url.endswith("/api/v1"):
        return taiga_url
    taiga_url = taiga_url.replace("//tree.", "//api.")
    return f"{taiga_url}/api/v1"


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

    try:
        resp = await _get_client().request(
            method=request.method,
            url=target_url,
            headers={
                "Authorization": authorization,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "x-disable-pagination": "True",
            },
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
