"""FastAPI dependencies shared by API routers.

Credentials are validated against the workspace's PM tool ("the PM token is
your identity"): `get_auth_context` confirms the bearer token is accepted by
the anchored PM, and `get_request_context` additionally confirms the token can
read the project named in `X-Project-Id`. Without this, any non-empty token
string would grant read/write access to every project's context files.

The identity provider is resolved server-side (TAIGA_API_URL env / workspace
config) and never from request headers — otherwise an attacker could point
validation at a host they control and mint their own "valid" tokens.
"""

import hashlib
import logging
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass

import httpx
from fastapi import Header, HTTPException, status

from backend.app.services.request_context import RequestContext

_logger = logging.getLogger("apex.deps")


@dataclass(frozen=True)
class AuthContext:
    pm_token: str


_MAX_TOKEN_LEN = 2_000

_VALID_TTL = 60.0    # seconds a successful validation is trusted
_INVALID_TTL = 10.0  # failed validations are remembered briefly to blunt hammering
_VERIFY_TIMEOUT = 8.0
_CACHE_MAX_ENTRIES = 10_000  # bound memory under token-rotation abuse

_cache_lock = threading.Lock()
# OrderedDict for LRU eviction (audit M8): newest at the end, evict from the front.
_token_cache: "OrderedDict[str, tuple[float, bool]]" = OrderedDict()                 # token_hash -> (expires_at, ok)
_project_cache: "OrderedDict[tuple[str, int], tuple[float, bool]]" = OrderedDict()   # (token_hash, project_id) -> ...

_verify_client: httpx.Client | None = None


def _get_verify_client() -> httpx.Client:
    global _verify_client
    if _verify_client is None or _verify_client.is_closed:
        _verify_client = httpx.Client(timeout=_VERIFY_TIMEOUT, follow_redirects=False)
    return _verify_client


def _token_key(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()[:32]


def _cache_get(cache: dict, key) -> bool | None:
    with _cache_lock:
        hit = cache.get(key)
        if hit is not None and hit[0] > time.monotonic():
            cache.move_to_end(key)  # mark recently used (LRU recency)
            return hit[1]
        cache.pop(key, None)
        return None


def _cache_put(cache: dict, key, ok: bool) -> None:
    ttl = _VALID_TTL if ok else _INVALID_TTL
    with _cache_lock:
        if len(cache) >= _CACHE_MAX_ENTRIES and key not in cache:
            # Evict expired entries first, then the least-recently-used ~10%
            # rather than nuking the whole cache (audit M8).
            now = time.monotonic()
            for k in [k for k, (exp, _) in cache.items() if exp <= now]:
                del cache[k]
            while len(cache) >= _CACHE_MAX_ENTRIES:
                cache.popitem(last=False)  # FIFO/LRU: drop the oldest
        cache[key] = (time.monotonic() + ttl, ok)
        cache.move_to_end(key)


def _pm_endpoints() -> tuple[str, str, str]:
    """Return (auth_scheme, identity_url, project_url_template) for the anchored PM.

    Taiga anchor resolution: TAIGA_API_URL env (operator-set — required for
    self-hosted/tunnelled instances) → workspace-config taiga_url (legacy) →
    Taiga Cloud. All sources pass the proxy's SSRF validator since the result
    is dialled server-side.
    """
    import os

    from src import context_manager

    config = context_manager.load_config()
    pm_tool = config.get("pm_tool") or "taiga"
    if pm_tool == "jira":
        base = (config.get("jira_base_url") or "").rstrip("/")
        if not base:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Workspace is configured for Jira but has no Jira base URL.",
            )
        return "Basic", f"{base}/rest/api/3/myself", f"{base}/rest/api/3/project/{{project_id}}"

    from backend.app.api.taiga_proxy import _validate_taiga_url

    base = (
        os.getenv("TAIGA_API_URL", "").strip().rstrip("/")
        or (config.get("taiga_url") or "").strip().rstrip("/")
        or "https://api.taiga.io"
    )
    if not base.endswith("/api/v1"):
        base = base.replace("//tree.", "//api.") + "/api/v1"
    base = _validate_taiga_url(base, source="Taiga identity URL")
    return "Bearer", f"{base}/users/me", f"{base}/projects/{{project_id}}"


def _pm_get(url: str, scheme: str, token: str) -> bool:
    """GET url with the user's credentials; True on 2xx, False on PM rejection."""
    try:
        resp = _get_verify_client().get(
            url,
            headers={"Authorization": f"{scheme} {token}", "Accept": "application/json"},
        )
    except httpx.RequestError as exc:
        _logger.error("PM credential check failed to reach %s: %s", url, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not reach the PM tool to validate credentials.",
        ) from exc
    return resp.is_success


def _verify_pm_token(token: str) -> None:
    """Raise 401 unless the anchored PM accepts this token as a valid login."""
    key = _token_key(token)
    cached = _cache_get(_token_cache, key)
    if cached is True:
        return
    if cached is None:
        scheme, identity_url, _ = _pm_endpoints()
        cached = _pm_get(identity_url, scheme, token)
        _cache_put(_token_cache, key, cached)
    if not cached:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="PM tool rejected the credentials. Sign in again.",
        )


def _verify_project_access(token: str, project_id: int) -> None:
    """Raise 403 unless the token can read the project on the anchored PM."""
    key = (_token_key(token), project_id)
    cached = _cache_get(_project_cache, key)
    if cached is True:
        return
    if cached is None:
        scheme, _, project_tpl = _pm_endpoints()
        cached = _pm_get(project_tpl.format(project_id=project_id), scheme, token)
        _cache_put(_project_cache, key, cached)
    if not cached:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"PM tool denied access to project {project_id}.",
        )


def get_auth_context(
    authorization: str = Header(default="", alias="Authorization"),
) -> AuthContext:
    if "\r" in authorization or "\n" in authorization:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid authorization header.",
        )
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization: Bearer <token> header is required.",
        )
    if len(token) > _MAX_TOKEN_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid authorization token.",
        )
    _verify_pm_token(token)
    return AuthContext(pm_token=token)


def get_request_context(
    authorization: str = Header(default="", alias="Authorization"),
    project_id_new: int | None = Header(default=None, alias="X-Project-Id"),
    project_id_legacy: int | None = Header(default=None, alias="X-Taiga-Project-Id"),
) -> RequestContext:
    raw = project_id_new if isinstance(project_id_new, int) else (project_id_legacy if isinstance(project_id_legacy, int) else None)
    project_id: int | None = raw
    if project_id is None or project_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Project-Id header is required.",
        )
    auth = get_auth_context(authorization)
    _verify_project_access(auth.pm_token, project_id)
    return RequestContext(pm_token=auth.pm_token, project_id=project_id)
