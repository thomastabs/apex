"""Simple sliding-window rate limiter for expensive AI endpoints.

Two layers: per-token (normal per-user budget) and per-IP. The per-IP cap
exists because the token bucket alone can be reset by rotating the token
string; the source address cannot.
"""

import hashlib
import os
import threading
import time
from collections import defaultdict

from fastapi import Depends, HTTPException, Request, status

from backend.app.api.deps import AuthContext, get_auth_context
from src import distributed

# When REDIS_URL is set (multi-replica), the buckets below are backed by Redis
# counters so every limit is global across replicas; otherwise they stay the
# process-local dicts (single-replica behaviour, unchanged). See src/distributed.


def _redis_hit_over_limit(client, key: str, limit: int, window: int) -> bool:
    """Count one hit against a fixed window (from the first hit); True if over."""
    count = client.incr(key)
    if count == 1:
        client.expire(key, window)
    return count > limit


def _redis_record_failure(client, key: str, window: int) -> None:
    count = client.incr(key)
    if count == 1:
        client.expire(key, window)


def _redis_failure_over_limit(client, key: str, limit: int) -> bool:
    value = client.get(key)
    return value is not None and int(value) >= limit

_lock = threading.Lock()
# key → (window_start, request_count)
_buckets: dict[str, tuple[float, int]] = defaultdict(lambda: (time.monotonic(), 0))

_WINDOW_SECS = 60
_MAX_AI_REQUESTS = 20        # per token
_MAX_AI_REQUESTS_PER_IP = 30  # per source address, across all tokens

# Credential brute-force protection for the PM auth relays.
_MAX_AUTH_ATTEMPTS_PER_IP = 10   # login attempts per IP per minute (Taiga /auth)
_MAX_AUTH_FAILURES_PER_IP = 15   # upstream credential rejections per IP per window
_MAX_AUTH_FAILURES_PER_USER = 8  # upstream rejections targeting one account per window
_FAILURE_WINDOW_SECS = 300
# Separate dict: the AI limiter prunes its buckets on the 60s window, which
# would wipe failure counters early if they shared storage.
_failure_buckets: dict[str, tuple[float, int]] = {}
# Per-account failure counter. The per-IP limiter is bypassable by forging
# X-Forwarded-For (one account stuffed "from many IPs"); the username is the
# resource under attack and cannot be spoofed, so this closes that gap.
_username_failure_buckets: dict[str, tuple[float, int]] = {}

# Bound memory under source-rotation abuse (mirrors deps.py's token/project
# cache cap). Without this, a key that's never revisited — e.g. an attacker
# hammering the pre-auth login endpoint from a fresh IP every request — never
# triggers its own lazy expiry check, so the dict grows without bound even
# though each individual entry is small.
_MAX_BUCKET_ENTRIES = 10_000


def _prune_and_cap(buckets: dict, now: float, window: float) -> None:
    """Drop expired entries, then cap total size via oldest-first eviction.
    Caller holds _lock."""
    expired = [k for k, (ws, _) in buckets.items() if now - ws >= window]
    for k in expired:
        del buckets[k]
    if len(buckets) >= _MAX_BUCKET_ENTRIES:
        oldest = sorted(buckets.items(), key=lambda kv: kv[1][0])[: len(buckets) // 10 + 1]
        for k, _ in oldest:
            buckets.pop(k, None)


def _client_ip(request: Request) -> str:
    """Resolve the real client IP from X-Forwarded-For, trusting only the hops
    our own infrastructure appended.

    A proxy APPENDS the address it received the request from, so the rightmost
    entries are added by trusted infrastructure and the leftmost is whatever the
    client sent — i.e. attacker-controlled. Reading `[0]` (the old behaviour) let
    an attacker spoof a fresh IP per request and walk straight past every per-IP
    limit. With N trusted proxies in front (Azure Container Apps ingress = 1, the
    default), the real client is the Nth entry from the right.

    TRUSTED_PROXY_HOPS makes the count tunable without a code change — set it to
    match the actual number of proxies that rewrite XFF in front of the app. If
    the chain is shorter than expected (idx < 0), fall back to the socket peer
    rather than the spoofable leftmost value.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        hops = max(1, int(os.getenv("TRUSTED_PROXY_HOPS", "1") or "1"))
        idx = len(parts) - hops
        if idx >= 0:
            return parts[idx]
    return request.client.host if request.client else "unknown"


def _check_bucket(key: str, limit: int, now: float, what: str = "AI requests") -> None:
    """Count one request against key; raise 429 when over limit. Caller holds _lock."""
    _prune_and_cap(_buckets, now, _WINDOW_SECS)
    window_start, count = _buckets[key]
    if now - window_start > _WINDOW_SECS:
        _buckets[key] = (now, 1)
    elif count >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit: max {limit} {what} per minute. Try again shortly.",
        )
    else:
        _buckets[key] = (window_start, count + 1)


def auth_rate_limit(request: Request) -> None:
    """Dependency for the Taiga login relay: caps sign-in attempts per IP.

    Runs pre-auth (there is no token yet), so it can only key on the source
    address. Legitimate users sign in a handful of times per session;
    credential stuffing needs thousands of attempts.
    """
    ip_key = "auth:" + _client_ip(request)
    client = distributed.redis_client()
    if client is not None:
        if _redis_hit_over_limit(client, "rl:" + ip_key, _MAX_AUTH_ATTEMPTS_PER_IP, _WINDOW_SECS):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit: max {_MAX_AUTH_ATTEMPTS_PER_IP} sign-in attempts per minute. Try again shortly.",
            )
        return
    now = time.monotonic()
    with _lock:
        _check_bucket(ip_key, _MAX_AUTH_ATTEMPTS_PER_IP, now, what="sign-in attempts")


def check_auth_failures(request: Request) -> None:
    """Raise 429 when this IP accumulated too many upstream credential rejections.

    Unlike auth_rate_limit this also guards the Jira proxy, where every request
    carries Basic credentials and so any endpoint is a password oracle —
    throttling only *failures* leaves normal signed-in traffic untouched.
    """
    key = "authfail:" + _client_ip(request)
    client = distributed.redis_client()
    if client is not None:
        if _redis_failure_over_limit(client, "rl:" + key, _MAX_AUTH_FAILURES_PER_IP):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed PM sign-in attempts from this address. Try again later.",
            )
        return
    now = time.monotonic()
    with _lock:
        hit = _failure_buckets.get(key)
        if hit is None:
            return
        window_start, count = hit
        if now - window_start > _FAILURE_WINDOW_SECS:
            del _failure_buckets[key]
            return
        if count >= _MAX_AUTH_FAILURES_PER_IP:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed PM sign-in attempts from this address. Try again later.",
            )


def record_auth_failure(request: Request) -> None:
    """Count one upstream credential rejection against the source IP."""
    key = "authfail:" + _client_ip(request)
    client = distributed.redis_client()
    if client is not None:
        _redis_record_failure(client, "rl:" + key, _FAILURE_WINDOW_SECS)
        return
    now = time.monotonic()
    with _lock:
        _prune_and_cap(_failure_buckets, now, _FAILURE_WINDOW_SECS)
        hit = _failure_buckets.get(key)
        if hit is None or now - hit[0] > _FAILURE_WINDOW_SECS:
            _failure_buckets[key] = (now, 1)
        else:
            _failure_buckets[key] = (hit[0], hit[1] + 1)


def _username_key(username: str) -> str:
    # Normalise case/whitespace and hash so the bucket store never holds the
    # raw account names in memory.
    norm = (username or "").strip().lower()
    return "userfail:" + hashlib.sha256(norm.encode()).hexdigest()[:16]


def check_username_failures(username: str) -> None:
    """Raise 429 when one account has accumulated too many credential rejections.

    IP-independent, so forging X-Forwarded-For cannot spread a stuffing attack
    against a single account across fake source addresses.
    """
    key = _username_key(username)
    client = distributed.redis_client()
    if client is not None:
        if _redis_failure_over_limit(client, "rl:" + key, _MAX_AUTH_FAILURES_PER_USER):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed sign-in attempts for this account. Try again later.",
            )
        return
    now = time.monotonic()
    with _lock:
        hit = _username_failure_buckets.get(key)
        if hit is None:
            return
        window_start, count = hit
        if now - window_start > _FAILURE_WINDOW_SECS:
            del _username_failure_buckets[key]
            return
        if count >= _MAX_AUTH_FAILURES_PER_USER:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed sign-in attempts for this account. Try again later.",
            )


def record_username_failure(username: str) -> None:
    """Count one upstream credential rejection against the targeted account."""
    key = _username_key(username)
    client = distributed.redis_client()
    if client is not None:
        _redis_record_failure(client, "rl:" + key, _FAILURE_WINDOW_SECS)
        return
    now = time.monotonic()
    with _lock:
        _prune_and_cap(_username_failure_buckets, now, _FAILURE_WINDOW_SECS)
        hit = _username_failure_buckets.get(key)
        if hit is None or now - hit[0] > _FAILURE_WINDOW_SECS:
            _username_failure_buckets[key] = (now, 1)
        else:
            _username_failure_buckets[key] = (hit[0], hit[1] + 1)


def ai_rate_limit(request: Request, auth: AuthContext = Depends(get_auth_context)) -> None:
    """Dependency: max 20 AI requests/min per token AND 30/min per source IP."""
    token_key = "tok:" + hashlib.sha256(auth.pm_token.encode()).hexdigest()[:16]
    ip_key = "ip:" + _client_ip(request)
    client = distributed.redis_client()
    if client is not None:
        if _redis_hit_over_limit(client, "rl:" + token_key, _MAX_AI_REQUESTS, _WINDOW_SECS):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit: max {_MAX_AI_REQUESTS} AI requests per minute. Try again shortly.",
            )
        if _redis_hit_over_limit(client, "rl:" + ip_key, _MAX_AI_REQUESTS_PER_IP, _WINDOW_SECS):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit: max {_MAX_AI_REQUESTS_PER_IP} AI requests per minute. Try again shortly.",
            )
        return
    now = time.monotonic()
    with _lock:
        _check_bucket(token_key, _MAX_AI_REQUESTS, now)
        _check_bucket(ip_key, _MAX_AI_REQUESTS_PER_IP, now)
