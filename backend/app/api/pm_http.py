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
