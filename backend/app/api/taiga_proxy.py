"""Reverse proxy for all Taiga API calls.

Taiga self-hosted instances reject browser CORS preflight requests from
third-party origins. This module forwards all Taiga REST calls server-side
so the browser never contacts the Taiga instance directly.
"""

import logging
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from pydantic import BaseModel

router = APIRouter()
_logger = logging.getLogger("apex.taiga_proxy")

_TIMEOUT = 20.0
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(follow_redirects=False, timeout=_TIMEOUT)
    return _client


def _validate_taiga_url(url: str) -> str:
    """Require https:// and a proper hostname to prevent SSRF against internal services."""
    url = url.strip().rstrip("/")
    if not url.startswith("https://"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Taiga-Url must start with https://",
        )
    parsed = urlparse(url)
    host = parsed.hostname or ""
    # Block localhost / loopback / private ranges at the hostname level
    if host in ("localhost", "127.0.0.1", "::1") or host.startswith("192.168.") or host.startswith("10."):
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
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization: Bearer <token> header required.",
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
