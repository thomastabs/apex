"""FastAPI dependencies shared by API routers.

Credentials are validated against the workspace's PM tool ("the PM token is
your identity"): `get_auth_context` confirms the bearer token is accepted by
the anchored PM, and `get_request_context` additionally confirms the token can
read the project named in `X-Project-Id`. Without this, any non-empty token
string would grant read/write access to every project's context files.

The identity provider is resolved from the request's Taiga URL override,
TAIGA_API_URL env, workspace config, or Taiga Cloud. Taiga URL values are
validated by the same SSRF guard used by the proxy before the backend dials
them server-side.
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
_token_cache: "OrderedDict[tuple[str, str], tuple[float, bool]]" = OrderedDict()      # (token_hash, identity_url) -> ...
_project_cache: "OrderedDict[tuple[str, str], tuple[float, bool]]" = OrderedDict()    # (token_hash, project_url) -> ...

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


def _anchor_base(taiga_url_override: str = "") -> tuple[str, str]:
    """(pm_tool, base_url) selection WITHOUT SSRF validation.

    The base's host is the storage instance namespace
    (context_manager.instance_key), so this is the single source of truth for
    both credential validation and which contextspec/<instance>/ a request reads.

    Taiga anchor precedence: TAIGA_API_URL env → request override (X-Taiga-Url)
    → Taiga Cloud. The env var is an OPTIONAL single-instance lock; otherwise the
    per-request header anchors (safe — storage is instance-scoped). Workspace
    `taiga_url` config is deliberately NOT used: it is user-writable via POST
    /workspace/config, shared across users, and goes stale across sessions
    (e.g. a previous Cloudflare tunnel URL), which would validate a current
    private token against the wrong instance and 401. A present X-Taiga-Url also
    forces the Taiga path, so a stale config pm_tool can't misroute it.
    """
    import os

    from src import context_manager

    override = (taiga_url_override.strip().rstrip("/")
                if isinstance(taiga_url_override, str) else "")
    env_taiga = os.getenv("TAIGA_API_URL", "").strip().rstrip("/")

    config = context_manager.load_config()
    pm_tool = config.get("pm_tool") or "taiga"
    if pm_tool == "jira" and not override:
        return "jira", (config.get("jira_base_url") or "").rstrip("/")

    base = env_taiga or override or "https://api.taiga.io"
    if not base.endswith("/api/v1"):
        base = base.replace("//tree.", "//api.") + "/api/v1"
    return "taiga", base


def _resolve_anchor_base(taiga_url_override: str = "") -> tuple[str, str]:
    """Return (pm_tool, validated_api_base) for the anchored PM — used to dial
    the PM for credential validation, so the base passes the SSRF validator."""
    pm_tool, base = _anchor_base(taiga_url_override)
    if pm_tool == "jira":
        if not base:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Workspace is configured for Jira but has no Jira base URL.",
            )
        return "jira", base
    from backend.app.api.taiga_proxy import _validate_taiga_url
    return "taiga", _validate_taiga_url(base, source="Taiga identity URL")


def anchor_instance_id(taiga_url_override: str = "") -> str:
    """Storage instance namespace for the current anchor — matches the namespace
    get_request_context derives, without the SSRF/DNS dial (folder selection only)."""
    from src import context_manager
    _, base = _anchor_base(taiga_url_override)
    return context_manager.instance_key(base)


def _pm_endpoints(taiga_url_override: str = "") -> tuple[str, str, str]:
    """Return (auth_scheme, identity_url, project_url_template) for the anchored PM."""
    pm_tool, base = _resolve_anchor_base(taiga_url_override)
    if pm_tool == "jira":
        return "Basic", f"{base}/rest/api/3/myself", f"{base}/rest/api/3/project/{{project_id}}"
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


def _verify_pm_token(token: str, taiga_url_override: str = "") -> None:
    """Raise 401 unless the anchored PM accepts this token as a valid login."""
    scheme, identity_url, _ = _pm_endpoints(taiga_url_override)
    key = (_token_key(token), identity_url)
    cached = _cache_get(_token_cache, key)
    if cached is True:
        return
    if cached is None:
        cached = _pm_get(identity_url, scheme, token)
        _cache_put(_token_cache, key, cached)
    if not cached:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="PM tool rejected the credentials. Sign in again.",
        )


def _verify_project_access(token: str, project_id: int, taiga_url_override: str = "") -> None:
    """Raise 403 unless the token can read the project on the anchored PM."""
    scheme, _, project_tpl = _pm_endpoints(taiga_url_override)
    project_url = project_tpl.format(project_id=project_id)
    key = (_token_key(token), project_url)
    cached = _cache_get(_project_cache, key)
    if cached is True:
        return
    if cached is None:
        cached = _pm_get(project_url, scheme, token)
        _cache_put(_project_cache, key, cached)
    if not cached:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"PM tool denied access to project {project_id}.",
        )


def get_auth_context(
    authorization: str = Header(default="", alias="Authorization"),
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
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
    _verify_pm_token(token, x_taiga_url)
    return AuthContext(pm_token=token)


def get_request_context(
    authorization: str = Header(default="", alias="Authorization"),
    x_taiga_url: str | int = Header(default="", alias="X-Taiga-Url"),
    project_id_new: int | None = Header(default=None, alias="X-Project-Id"),
    project_id_legacy: int | None = Header(default=None, alias="X-Taiga-Project-Id"),
) -> RequestContext:
    # Backward compatibility for direct unit-test calls that predate x_taiga_url
    # and pass (authorization, project_id_new, project_id_legacy) positionally.
    if isinstance(x_taiga_url, int) and not isinstance(project_id_new, int):
        project_id_new = x_taiga_url
        x_taiga_url = ""
    raw = project_id_new if isinstance(project_id_new, int) else (project_id_legacy if isinstance(project_id_legacy, int) else None)
    project_id: int | None = raw
    if project_id is None or project_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Project-Id header is required.",
        )
    override = x_taiga_url if isinstance(x_taiga_url, str) else ""
    auth = get_auth_context(authorization, override)
    _verify_project_access(auth.pm_token, project_id, override)
    # Derive the storage instance namespace from the SAME validated anchor the
    # credentials were checked against — so a request can only ever reach the
    # contextspec/<instance>/ of an instance its token is actually valid on.
    from src import context_manager
    _, base = _resolve_anchor_base(override)
    instance_id = context_manager.instance_key(base)
    return RequestContext(pm_token=auth.pm_token, project_id=project_id, instance_id=instance_id)
