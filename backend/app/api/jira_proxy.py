"""Reverse proxy for Jira Cloud REST API v3.

Jira Cloud rejects browser CORS preflight requests that include Basic auth
headers. This catch-all route forwards all Jira REST v3 calls from the
browser through the FastAPI backend, which makes the actual request
server-side using the credentials provided by the client.
"""

import logging
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Header, HTTPException, Request, Response, status

from backend.app.api.pm_http import ResponseTooLarge, check_response_size, send_with_retry
from backend.app.api.rate_limit import check_auth_failures, record_auth_failure
from backend.app.api.ssrf import egress_host_allowed, is_blocked_host

router = APIRouter()
_logger = logging.getLogger("apex.jira_proxy")

_JIRA_REST_PREFIX = "/rest/api/3"
_TIMEOUT = 30.0


# Module-level client for connection pooling — created lazily, lives for process lifetime.
_CONNECT_TIMEOUT = 8.0  # fail fast on dead egress paths; read keeps the full budget
# Recycle idle keepalive sockets quickly so a connection bound to a dead Azure
# SNAT flow is dropped instead of being reused into a long timeout.
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


def validate_jira_base_url(url: str, *, source: str = "X-Jira-Base-Url") -> str:
    """Validate a Jira base URL — header override or persisted workspace config.

    Restricted to https:// *.atlassian.net to prevent SSRF: the config is
    writable through POST /workspace/config, so it is just as user-influenced
    as the pre-auth header path. Also called from the workspace router so bad
    URLs are rejected at save time, not only at proxy time.
    """
    url = url.strip().rstrip("/")
    if not url.startswith("https://"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{source} must start with https://")
    host = urlparse(url).hostname or ""
    if not host or is_blocked_host(host):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{source} must not point to a private/loopback address.",
        )
    if not (host == "atlassian.net" or host.endswith(".atlassian.net")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{source} must be an atlassian.net domain.",
        )
    if not egress_host_allowed(host):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{source}: host {host!r} is not in the egress allowlist.",
        )
    return url


def _get_jira_base_url() -> str:
    from src import context_manager

    config = context_manager.load_config()
    if config.get("pm_tool") != "jira":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace is not configured for Jira.",
        )
    base_url = config.get("jira_base_url", "").rstrip("/")
    if not base_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Jira base URL is not configured.",
        )
    return validate_jira_base_url(base_url, source="Configured Jira base URL")


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy_jira(
    path: str,
    request: Request,
    authorization: str = Header(default="", alias="Authorization"),
    x_jira_base_url: str = Header(default="", alias="X-Jira-Base-Url"),
) -> Response:
    """Forward Jira REST API v3 calls from the browser to Jira Cloud."""
    if "\r" in authorization or "\n" in authorization:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Authorization header.",
        )
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "basic" or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization: Basic <token> header required.",
        )
    # Every Jira request carries Basic credentials, so any endpoint doubles as
    # a password oracle — back off IPs that keep getting rejected upstream.
    check_auth_failures(request)
    if len(token.strip()) > 2_000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid authorization token.",
        )

    # X-Jira-Base-Url override is used during login (before config is saved).
    # Restricted to *.atlassian.net to prevent SSRF.
    base_url = validate_jira_base_url(x_jira_base_url) if x_jira_base_url else _get_jira_base_url()
    target_url = f"{base_url}{_JIRA_REST_PREFIX}/{path}"
    if request.url.query:
        target_url = f"{target_url}?{request.url.query}"

    # Skip body read for GET/HEAD — avoids stream-consumed errors from body-size middleware.
    body = b"" if request.method in ("GET", "HEAD") else await request.body()

    try:
        resp = await _send(
            request.method,
            target_url,
            headers={
                "Authorization": authorization,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            content=body or None,
        )
        check_response_size(resp, logger=_logger, url=target_url)
    except httpx.RequestError as exc:
        _logger.error("Jira proxy failed to reach %s: %s", target_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to reach Jira Cloud.",
        ) from exc
    except ResponseTooLarge as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Jira Cloud returned a response that was too large.",
        ) from exc

    if resp.status_code == 401:
        record_auth_failure(request)

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )
