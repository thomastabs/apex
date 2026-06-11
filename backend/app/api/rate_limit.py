"""Simple sliding-window rate limiter for expensive AI endpoints.

Two layers: per-token (normal per-user budget) and per-IP. The per-IP cap
exists because the token bucket alone can be reset by rotating the token
string; the source address cannot.
"""

import hashlib
import threading
import time
from collections import defaultdict

from fastapi import Depends, HTTPException, Request, status

from backend.app.api.deps import AuthContext, get_auth_context

_lock = threading.Lock()
# key → (window_start, request_count)
_buckets: dict[str, tuple[float, int]] = defaultdict(lambda: (time.monotonic(), 0))

_WINDOW_SECS = 60
_MAX_AI_REQUESTS = 20        # per token
_MAX_AI_REQUESTS_PER_IP = 30  # per source address, across all tokens


def _client_ip(request: Request) -> str:
    # Behind Azure Container Apps ingress the socket peer is the proxy;
    # the original client is the first X-Forwarded-For hop.
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_bucket(key: str, limit: int, now: float) -> None:
    """Count one request against key; raise 429 when over limit. Caller holds _lock."""
    window_start, count = _buckets[key]
    if now - window_start > _WINDOW_SECS:
        _buckets[key] = (now, 1)
    elif count >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit: max {limit} AI requests per minute. Try again shortly.",
        )
    else:
        _buckets[key] = (window_start, count + 1)


def ai_rate_limit(request: Request, auth: AuthContext = Depends(get_auth_context)) -> None:
    """Dependency: max 20 AI requests/min per token AND 30/min per source IP."""
    token_key = "tok:" + hashlib.sha256(auth.pm_token.encode()).hexdigest()[:16]
    ip_key = "ip:" + _client_ip(request)
    now = time.monotonic()
    with _lock:
        # Prune expired buckets to prevent unbounded growth
        expired = [k for k, (ws, _) in _buckets.items() if now - ws >= _WINDOW_SECS]
        for k in expired:
            del _buckets[k]
        _check_bucket(token_key, _MAX_AI_REQUESTS, now)
        _check_bucket(ip_key, _MAX_AI_REQUESTS_PER_IP, now)
