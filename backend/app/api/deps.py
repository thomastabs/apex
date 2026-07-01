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
from src import distributed

_logger = logging.getLogger("apex.deps")


@dataclass(frozen=True)
class AuthContext:
    pm_token: str
    # Stable PM account id (Taiga numeric `id` / Jira `accountId`) for the
    # validated token, resolved best-effort in get_auth_context. "" when it
    # could not be determined. Used ONLY to namespace persisted per-account
    # data (saved AI provider keys, src/ai_key_store.py) — never for authz.
    account_id: str = ""


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


def _redis_cache_key(key) -> str:
    # key is (token_hash, identity_or_project_url); both already non-secret
    # (token is sha256-truncated). Namespaced so token vs project entries differ.
    return "authc:" + key[0] + ":" + key[1]


def _cache_get(cache: dict, key) -> bool | None:
    client = distributed.redis_client()
    if client is not None:
        # Shared across replicas: a validation cached by one replica is visible to
        # all, and a revoked token is consistently re-checked once its TTL lapses.
        val = client.get(_redis_cache_key(key))
        return None if val is None else (val == "1")
    with _cache_lock:
        hit = cache.get(key)
        if hit is not None and hit[0] > time.monotonic():
            cache.move_to_end(key)  # mark recently used (LRU recency)
            return hit[1]
        cache.pop(key, None)
        return None


def _cache_put(cache: dict, key, ok: bool) -> None:
    ttl = _VALID_TTL if ok else _INVALID_TTL
    client = distributed.redis_client()
    if client is not None:
        client.setex(_redis_cache_key(key), int(ttl), "1" if ok else "0")
        return
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


def resolve_taiga_base(taiga_url_override: str = "") -> str:
    """Return the validated Taiga API base URL (e.g. https://api.taiga.io/api/v1).

    Raises 503 when pm_tool is Jira (import only supports Taiga).
    Used by import routes that need to dial Taiga server-side.
    """
    pm_tool, base = _resolve_anchor_base(taiga_url_override)
    if pm_tool != "taiga":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Import from PM is only supported for Taiga projects.",
        )
    return base


def _pm_endpoints(taiga_url_override: str = "") -> tuple[str, str, str]:
    """Return (auth_scheme, identity_url, project_url_template) for the anchored PM."""
    pm_tool, base = _resolve_anchor_base(taiga_url_override)
    if pm_tool == "jira":
        return "Basic", f"{base}/rest/api/3/myself", f"{base}/rest/api/3/project/{{project_id}}"
    return "Bearer", f"{base}/users/me", f"{base}/projects/{{project_id}}"


def _pm_get(url: str, scheme: str, token: str) -> bool:
    """GET url with the user's credentials; True on 2xx, False on PM rejection.

    Routed through the Cloudflare egress relay for hosts Azure cannot reach
    directly (api.taiga.io), mirroring the Taiga proxy's `_egress`. Without this
    the credential check dials Taiga Cloud directly and fails with [Errno 101]
    Network is unreachable (→ 503) whenever direct egress is firewall-DROPped —
    even though the proxy itself stays up via the relay. The token-validation
    cache masks this until it goes cold (e.g. after a restart).
    """
    from backend.app.api.taiga_proxy import _egress, _pin_unless_relayed

    request_url, headers = _egress(
        url, {"Authorization": f"{scheme} {token}", "Accept": "application/json"}
    )
    # Unified egress: same relay routing AND DNS-rebinding IP-pin the proxy uses
    # (audit H2). _pin_unless_relayed leaves the relay path alone and pins the
    # direct path; a host that now resolves only to blocked IPs raises 400.
    request_url, headers, ext = _pin_unless_relayed(request_url, headers)
    try:
        resp = _get_verify_client().request(
            "GET", request_url, headers=headers, **({"extensions": ext} if ext else {})
        )
    except httpx.RequestError as exc:
        _logger.error("PM credential check failed to reach %s: %s", url, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not reach the PM tool to validate credentials.",
        ) from exc
    return resp.is_success


def _pm_get_json(url: str, scheme: str, token: str) -> dict | None:
    """Best-effort GET returning the parsed JSON body, or None on any failure
    (network error, non-2xx, non-JSON). Mirrors _pm_get's relay/DNS-pin routing
    so it works wherever _pm_get does, but never raises — callers use this only
    for optional identity lookups where a miss just means "skip personalising
    this request", not an auth failure."""
    from backend.app.api.taiga_proxy import _egress, _pin_unless_relayed

    request_url, headers = _egress(
        url, {"Authorization": f"{scheme} {token}", "Accept": "application/json"}
    )
    request_url, headers, ext = _pin_unless_relayed(request_url, headers)
    try:
        resp = _get_verify_client().request(
            "GET", request_url, headers=headers, **({"extensions": ext} if ext else {})
        )
    except httpx.RequestError as exc:
        _logger.debug("_pm_get_json failed to reach %s: %s", url, exc)
        return None
    if not resp.is_success:
        return None
    try:
        return resp.json()
    except ValueError:
        return None


_ACCOUNT_CACHE_TTL = 60.0  # matches _VALID_TTL — namespacing data only, not a security boundary
_account_id_cache: "OrderedDict[tuple[str, str], tuple[float, str]]" = OrderedDict()


def _redis_account_key(key: tuple[str, str]) -> str:
    return "authacct:" + key[0] + ":" + key[1]


def resolve_account_id(token: str, taiga_url_override: str = "") -> str:
    """Best-effort stable PM account id (Taiga numeric `id` / Jira `accountId`)
    for *token*. Used ONLY to namespace persisted per-account data — never for
    authorization, so a miss (network hiccup, unrecognised response shape)
    degrades to "" rather than raising; callers must treat that as "no
    personalisation this request", not an error.

    Separate cache from _token_cache/_verify_pm_token by design: keeping this
    fully self-contained (its own dial, its own cache) means it can never
    change the behaviour or risk profile of the security-critical token/project
    validation above, at the cost of one extra identity-endpoint dial per
    _ACCOUNT_CACHE_TTL window per user — negligible next to a user's actual
    request volume in an interactive tool like this.
    """
    scheme, identity_url, _ = _pm_endpoints(taiga_url_override)
    key = (_token_key(token), identity_url)

    client = distributed.redis_client()
    if client is not None:
        cached = client.get(_redis_account_key(key))
        if cached is not None:
            return cached
    else:
        with _cache_lock:
            hit = _account_id_cache.get(key)
            if hit is not None and hit[0] > time.monotonic():
                _account_id_cache.move_to_end(key)
                return hit[1]

    body = _pm_get_json(identity_url, scheme, token)
    account_id = ""
    if body:
        account_id = (
            str(body.get("accountId") or "").strip()
            if scheme == "Basic"
            else str(body.get("id") or "").strip()
        )
    if not account_id:
        return ""  # don't cache a miss — a transient dial failure shouldn't stick for the full TTL

    if client is not None:
        client.setex(_redis_account_key(key), int(_ACCOUNT_CACHE_TTL), account_id)
    else:
        with _cache_lock:
            if len(_account_id_cache) >= _CACHE_MAX_ENTRIES and key not in _account_id_cache:
                now = time.monotonic()
                for k in [k for k, (exp, _) in _account_id_cache.items() if exp <= now]:
                    del _account_id_cache[k]
                while len(_account_id_cache) >= _CACHE_MAX_ENTRIES:
                    _account_id_cache.popitem(last=False)
            _account_id_cache[key] = (time.monotonic() + _ACCOUNT_CACHE_TTL, account_id)
            _account_id_cache.move_to_end(key)
    return account_id


def _load_personal_ai_keys(account_id: str, taiga_url_override: str) -> None:
    """Populate ai_engine's per-request key ContextVar from persisted
    per-account storage (src/ai_key_store.py). Best-effort and non-fatal: any
    failure here must not break the request — AI calls simply fall back to the
    deployment's env-var keys. Always called (even with account_id="") so a
    prior request's keys can never leak into one that has none.
    """
    from src.ai_engine import set_user_api_keys

    keys: dict[str, str] = {}
    if account_id:
        try:
            from src import ai_key_store

            keys = ai_key_store.load_keys(anchor_instance_id(taiga_url_override), account_id)
        except Exception:
            _logger.debug("_load_personal_ai_keys: lookup failed", exc_info=True)
    set_user_api_keys(keys)


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
    account_id = resolve_account_id(token, x_taiga_url)
    _load_personal_ai_keys(account_id, x_taiga_url)
    return AuthContext(pm_token=token, account_id=account_id)


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
