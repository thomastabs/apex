"""Simple per-token sliding-window rate limiter for expensive AI endpoints."""

import threading
import time
from collections import defaultdict

from fastapi import Depends, HTTPException, status

from backend.app.api.deps import AuthContext, get_auth_context

_lock = threading.Lock()
# key → (window_start, request_count)
_buckets: dict[str, tuple[float, int]] = defaultdict(lambda: (time.monotonic(), 0))

_WINDOW_SECS = 60
_MAX_AI_REQUESTS = 10


def ai_rate_limit(auth: AuthContext = Depends(get_auth_context)) -> None:
    """Dependency: max 10 AI requests per token per 60 s."""
    key = auth.taiga_token[-20:]
    now = time.monotonic()
    with _lock:
        window_start, count = _buckets[key]
        if now - window_start >= _WINDOW_SECS:
            _buckets[key] = (now, 1)
        elif count >= _MAX_AI_REQUESTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit: max {_MAX_AI_REQUESTS} AI requests per minute. Try again shortly.",
            )
        else:
            _buckets[key] = (window_start, count + 1)
