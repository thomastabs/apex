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

# Upstream 429 retry (idempotent reads only). Cost-based APIs (e.g. Figma) throttle
# bursty reads; a short, Retry-After-honouring wait usually clears it without
# surfacing the error. Capped so a hostile/large Retry-After never hangs a request.
_RETRY_AFTER_CAP = 5.0
_DEFAULT_429_DELAY = 1.0


def _retry_after_secs(resp: httpx.Response) -> float:
    """Parse the Retry-After header (delta-seconds only) → capped delay."""
    raw = resp.headers.get("retry-after", "").strip()
    delay = _DEFAULT_429_DELAY
    if raw.isdigit():
        delay = float(raw)
    return min(delay, _RETRY_AFTER_CAP)


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
    last_exc: BaseException | None = None
    for attempt in range(len(_BACKOFFS) + 1):
        try:
            resp = await get_client().request(method=method, url=url, **kwargs)
            # Retry idempotent reads on an upstream 429, honouring Retry-After.
            if resp.status_code == 429 and idempotent and attempt < len(_BACKOFFS):
                delay = _retry_after_secs(resp)
                logger.warning(
                    "429 from %s — retry %d/%d after %.2fs",
                    url, attempt + 1, len(_BACKOFFS), delay,
                )
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
