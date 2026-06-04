"""Reverse proxy for Jira Cloud REST API v3.

Jira Cloud rejects browser CORS preflight requests that include Basic auth
headers. This catch-all route forwards all Jira REST v3 calls from the
browser through the FastAPI backend, which makes the actual request
server-side using the credentials provided by the client.
"""

import logging

import httpx
from fastapi import APIRouter, Header, HTTPException, Request, Response, status

router = APIRouter()
_logger = logging.getLogger("apex.jira_proxy")

_JIRA_REST_PREFIX = "/rest/api/3"
_TIMEOUT = 30.0

# Module-level client for connection pooling — created lazily, lives for process lifetime.
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(follow_redirects=False, timeout=_TIMEOUT)
    return _client


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
    return base_url


def _validate_override_base_url(url: str) -> str:
    """Validate X-Jira-Base-Url override used in the pre-auth login flow.

    Restricted to *.atlassian.net to prevent SSRF via the unauthenticated path.
    """
    from urllib.parse import urlparse

    url = url.strip().rstrip("/")
    if not url.startswith("https://"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="X-Jira-Base-Url must start with https://")
    host = urlparse(url).hostname or ""
    if not (host == "atlassian.net" or host.endswith(".atlassian.net")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Jira-Base-Url must be an atlassian.net domain.",
        )
    return url


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy_jira(
    path: str,
    request: Request,
    authorization: str = Header(default="", alias="Authorization"),
    x_jira_base_url: str = Header(default="", alias="X-Jira-Base-Url"),
) -> Response:
    """Forward Jira REST API v3 calls from the browser to Jira Cloud."""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "basic" or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization: Basic <token> header required.",
        )

    # X-Jira-Base-Url override is used during login (before config is saved).
    # Restricted to *.atlassian.net to prevent SSRF.
    base_url = _validate_override_base_url(x_jira_base_url) if x_jira_base_url else _get_jira_base_url()
    target_url = f"{base_url}{_JIRA_REST_PREFIX}/{path}"
    if request.url.query:
        target_url = f"{target_url}?{request.url.query}"

    # Skip body read for GET/HEAD — avoids stream-consumed errors from body-size middleware.
    body = b"" if request.method in ("GET", "HEAD") else await request.body()

    try:
        resp = await _get_client().request(
            method=request.method,
            url=target_url,
            headers={
                "Authorization": authorization,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            content=body or None,
        )
    except httpx.RequestError as exc:
        _logger.error("Jira proxy failed to reach %s: %s", target_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to reach Jira Cloud.",
        ) from exc

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )
