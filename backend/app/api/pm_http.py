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
    last_exc: BaseException | None = None
    for attempt in range(len(_BACKOFFS) + 1):
        try:
            return await get_client().request(method=method, url=url, **kwargs)
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
