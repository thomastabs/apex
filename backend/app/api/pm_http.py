"""Self-heal HTTP send shared by the PM proxies (Taiga, Jira).

Azure Container Apps outbound flows to a single destination can silently die
(SNAT path drop / upstream throttling) while the pooled httpx client keeps
reusing the dead connection. A connect-level failure means the TCP connection
never established, so the request was never sent — safe to reset the pool and
retry for ALL methods. Read-level failures (the upstream accepted the
connection) are never retried here: the request may already have been applied.
"""

import asyncio
import logging
import random
from collections.abc import Awaitable, Callable

import httpx

CONNECT_ERRORS = (httpx.ConnectError, httpx.ConnectTimeout)

# Generous cap for Taiga/Jira JSON payloads — bounds memory/forwarding cost of a
# misbehaving or compromised upstream (audit M8). Taiga/Jira are pre-validated,
# user-configured hosts (not arbitrary attacker-controlled ones), so a post-
# download check is a proportionate bound here rather than full response
# streaming: send_with_retry already reads the body fully via httpx's
# non-streaming request() API before this can run.
MAX_RESPONSE_BYTES = 15 * 1024 * 1024  # 15 MB


class ResponseTooLarge(Exception):
    """Raised when an upstream PM response exceeds MAX_RESPONSE_BYTES."""

    def __init__(self, size: int) -> None:
        self.size = size
        super().__init__(f"upstream response too large: {size} bytes")


def check_response_size(resp: httpx.Response, *, logger: logging.Logger, url: str) -> None:
    """Raise ResponseTooLarge if resp's body exceeds MAX_RESPONSE_BYTES."""
    size = len(resp.content)
    if size > MAX_RESPONSE_BYTES:
        logger.warning("Response from %s too large (%d bytes) — rejecting", url, size)
        raise ResponseTooLarge(size)

# 1 initial attempt + len(_BACKOFFS) retries. Base delays are jittered so a
# retry storm doesn't hammer the PM at a fixed interval.
_BACKOFFS = (0.25, 0.75)

# Upstream 429 on an idempotent read: try ONE quick retry only when the upstream
# asks us back almost immediately (transient burst). A larger Retry-After means a
# real throttle — don't sit on the request for seconds; return the 429 and let the
# caller (e.g. the Figma proxy's cooldown + serve-stale) absorb it.
_FAST_RETRY_MAX = 1.5
_DEFAULT_429_DELAY = 0.5


def _retry_after_secs(resp: httpx.Response) -> float | None:
    """Parsed Retry-After (delta-seconds) if a quick retry is worthwhile, else None."""
    raw = resp.headers.get("retry-after", "").strip()
    delay = float(raw) if raw.isdigit() else _DEFAULT_429_DELAY
    return delay if delay <= _FAST_RETRY_MAX else None


async def send_with_retry(
    get_client: Callable[[], httpx.AsyncClient],
    reset_client: Callable[[], Awaitable[None]],
    method: str,
    url: str,
    *,
    logger: logging.Logger,
    **kwargs,
) -> httpx.Response:
    """Send via the pooled client, resetting + retrying on connect failures.

    Up to len(_BACKOFFS) retries with jittered backoff; the final connect
    failure propagates to the caller (mapped to 502 by the proxy).
    """
    idempotent = method.upper() in ("GET", "HEAD")
    did_429_retry = False
    last_exc: BaseException | None = None
    for attempt in range(len(_BACKOFFS) + 1):
        try:
            resp = await get_client().request(method=method, url=url, **kwargs)
            # One fast retry for a transient 429 on an idempotent read; a real
            # throttle (long/absent Retry-After) returns the 429 to the caller.
            if resp.status_code == 429 and idempotent and not did_429_retry:
                delay = _retry_after_secs(resp)
                if delay is not None:
                    did_429_retry = True
                    logger.warning("429 from %s — single retry after %.2fs", url, delay)
                    await asyncio.sleep(delay)
                    continue
            return resp
        except CONNECT_ERRORS as exc:
            last_exc = exc
            await reset_client()
            if attempt == len(_BACKOFFS):
                break
            delay = _BACKOFFS[attempt] * (0.5 + random.random())
            logger.warning(
                "Connect failure to %s (%s: %s) — reset pool, retry %d/%d after %.2fs",
                url, type(exc).__name__, exc, attempt + 1, len(_BACKOFFS), delay,
            )
            await asyncio.sleep(delay)
    assert last_exc is not None  # loop only exits via return or a caught error
    raise last_exc
