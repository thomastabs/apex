"""Reverse proxy for Figma REST API calls.

The Figma REST API does not return permissive CORS headers, so the browser
cannot call it directly with a personal access token. This module forwards all
Figma REST calls server-side. The target host is fixed to api.figma.com, which
is publicly reachable from Azure Container Apps — so, unlike the Taiga proxy,
there is no Cloudflare egress relay; the request is sent directly (DNS-rebinding
pinned). Modelled on taiga_proxy.py.
"""

import hashlib
import json
import logging
import time

import httpx
from fastapi import APIRouter, Header, HTTPException, Request, Response, status

from backend.app.api.pm_http import send_with_retry
from backend.app.api.rate_limit import check_auth_failures, record_auth_failure
from backend.app.api.ssrf import egress_host_allowed, is_blocked_host, pinned_target

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

# Resilient response cache for idempotent GETs. Figma's REST API is cost-based
# rate-limited (429); opening one file fans out into files+styles+components+
# nodes+comments+images, and the board renders one /images thumbnail PER linked
# story card — once the token's budget is spent every call (even a single file
# verify) 429s, and it stays tripped for a while.
#
# Two windows per entry:
#  - fresh  (<= _CACHE_TTL): served directly, no upstream call.
#  - stale  (<= _STALE_TTL): served as a fallback when upstream 429s, so the UI
#    keeps last-known-good data through a throttle instead of erroring.
#
# Plus a per-key cooldown: after a 429 we stop calling Figma for that path for a
# short window so the rate bucket can actually refill (hammering keeps it tripped
# forever). Per-process + bounded-staleness, consistent with the other in-process
# caches under the single-writer assumption (see CLAUDE.md "Key gotchas").
_CACHE_TTL = 60.0  # fresh window
_STALE_TTL = 900.0  # serve-stale fallback window (15 min)
_COOLDOWN = 30.0  # after a 429, skip upstream for this key this long
_COOLDOWN_CAP = 120.0  # never honour a Retry-After longer than this
_CACHE_MAX = 256
# key -> (stored_monotonic, status_code, content, media_type)
_cache: dict[str, tuple[float, int, bytes, str]] = {}
# key -> monotonic time until which we must NOT call upstream (429 backoff)
_cooldown: dict[str, float] = {}


def _cache_key(path: str, query: str, token: str) -> str:
    # Token is part of the key (different PATs may see different files) but only
    # as a salted digest — never store the raw credential.
    tok = hashlib.sha256(token.encode()).hexdigest()[:16]
    return f"{tok}:{path}?{query}"


def _cache_get(key: str, *, allow_stale: bool = False) -> tuple[int, bytes, str] | None:
    """Return cached (code, content, media). Fresh by default; allow_stale extends
    the acceptance window to _STALE_TTL for use as a 429 fallback."""
    hit = _cache.get(key)
    if hit is None:
        return None
    stored, code, content, media = hit
    age = time.monotonic() - stored
    horizon = _STALE_TTL if allow_stale else _CACHE_TTL
    if age >= horizon:
        if age >= _STALE_TTL:
            _cache.pop(key, None)  # fully expired — reclaim
        return None
    return code, content, media


def _cache_put(key: str, code: int, content: bytes, media: str) -> None:
    if len(_cache) >= _CACHE_MAX and key not in _cache:
        # Drop the oldest entry — cheap bound, no LRU bookkeeping.
        oldest = min(_cache, key=lambda k: _cache[k][0])
        _cache.pop(oldest, None)
    _cache[key] = (time.monotonic(), code, content, media)


def _cooldown_active(key: str) -> bool:
    until = _cooldown.get(key)
    if until is None:
        return False
    if time.monotonic() >= until:
        _cooldown.pop(key, None)
        return False
    return True


def _set_cooldown(key: str, retry_after: float | None) -> None:
    secs = _COOLDOWN if not retry_after else min(retry_after, _COOLDOWN_CAP)
    _cooldown[key] = time.monotonic() + secs


def _human_duration(secs: int) -> str:
    if secs >= 86_400:
        return f"~{secs // 86_400} day(s)"
    if secs >= 3_600:
        return f"~{secs // 3_600} hour(s)"
    if secs >= 60:
        return f"~{secs // 60} minute(s)"
    return f"{secs} second(s)"


def _figma_rate_limit_detail(headers: httpx.Headers) -> str:
    """Turn Figma's 429 diagnostic headers into a precise, honest message.

    Figma rate-limits the GET-file endpoint by the FILE's plan and the caller's
    SEAT on that file's team (not by the token string): on a Starter/free plan a
    View/Collab seat reads a file's content only ~6x PER MONTH via a personal
    access token, and the limit is tracked per Figma USER — so rotating the PAT or
    waiting minutes does nothing. Surface the tier + Retry-After so the UI can say
    why instead of showing Figma's opaque body or a misleading 'try shortly'.
    """
    tier = (headers.get("x-figma-plan-tier") or "").strip().lower()
    ra = (headers.get("retry-after") or "").strip()
    parts = ["Figma is rate-limiting this Figma account"]
    if tier:
        parts[0] = f"Figma is rate-limiting this {tier}-plan file"
    if ra.isdigit():
        parts.append(f"retry after {_human_duration(int(ra))}")
    msg = "; ".join(parts) + "."
    if tier in ("starter", "student"):
        msg += (
            " On Starter/free plans a personal access token can read a file's"
            " content only ~6x per month, tracked per Figma account — a new token"
            " or waiting will not help. Use a Dev/Full seat on the file's team, or"
            " move the file to a Professional+ team."
        )
    return msg


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
    x_figma_force: str = Header(default="", alias="X-Figma-Force"),
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

    # A deliberate user action (e.g. clicking "Connect Figma") sets X-Figma-Force so
    # the request always reaches Figma — the cooldown/cache must never short-circuit
    # a manual retry, only the app's automatic background fan-out (thumbnails, drift).
    force = x_figma_force.strip() == "1"
    is_cacheable = request.method == "GET" and not force
    cache_key = _cache_key(path, request.url.query, token) if request.method == "GET" else ""
    if is_cacheable:
        fresh = _cache_get(cache_key)
        if fresh is not None:
            code, content, media = fresh
            return Response(content=content, status_code=code, media_type=media)
        # Under a 429 cooldown: don't touch Figma (let its bucket refill). Serve
        # stale-but-recent data if we have it; otherwise fail fast (no 10s hang).
        if _cooldown_active(cache_key):
            stale = _cache_get(cache_key, allow_stale=True)
            if stale is not None:
                code, content, media = stale
                return Response(content=content, status_code=code, media_type=media)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Figma is rate-limiting this token; retry shortly.",
            )

    target_url = f"{_FIGMA_API_BASE}/{path}"
    if request.url.query:
        target_url = f"{target_url}?{request.url.query}"

    body = b"" if request.method in ("GET", "HEAD") else await request.body()
    headers = {"X-Figma-Token": token, "Accept": "application/json"}
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

    media_type = resp.headers.get("content-type", "application/json")
    # Cache/cooldown bookkeeping runs for every GET (including a forced one) so a
    # successful manual connect warms the cache and a 429 still backs off the
    # background fan-out — force only bypasses the *inbound* short-circuit.
    is_get = request.method == "GET"
    if is_get and resp.status_code == 200:
        _cache_put(cache_key, resp.status_code, resp.content, media_type)
    elif is_get and resp.status_code == 429:
        # Start a cooldown so the next identical GET skips Figma and lets the
        # bucket refill; if we have recent data, serve it stale instead of erroring.
        # This applies to forced GETs too: an explicit user Sync bypasses the
        # *inbound* cooldown to reach Figma, but if Figma itself is genuinely
        # throttling we still return last-known-good rather than failing the Sync.
        ra = resp.headers.get("retry-after", "").strip()
        _set_cooldown(cache_key, float(ra) if ra.isdigit() else None)
        stale = _cache_get(cache_key, allow_stale=True)
        if stale is not None:
            code, content, media = stale
            return Response(content=content, status_code=code, media_type=media)
        # No stale fallback: replace Figma's opaque 429 body with a structured one
        # that explains WHY (plan tier + Retry-After), so the UI stops giving the
        # misleading "wait a moment / rotate the token" advice for what is often a
        # per-month, per-account Starter-plan cap.
        body = json.dumps({"detail": _figma_rate_limit_detail(resp.headers)}).encode()
        return Response(content=body, status_code=429, media_type="application/json")

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=media_type,
    )
