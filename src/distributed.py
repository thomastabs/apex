"""Optional distributed coordination via Redis (Upstash) for running the backend
with more than one replica.

OFF by default: when ``REDIS_URL`` is unset (or the configured Redis is
unreachable), every primitive falls back to a process-local equivalent and the
behaviour is identical to the single-replica deployment. When set, the
story-index/config write lock and the rate-limit counters become coherent across
replicas, which is the precondition for raising ``apex-backend`` max-replicas
above 1 (see the single-writer note in CLAUDE.md).

Backed by the Upstash Redis serverless free tier — ``REDIS_URL`` is the
``rediss://default:<password>@<host>:6379`` connection string; redis-py speaks
the Redis protocol to it over TLS.
"""

import contextlib
import logging
import os
import threading

_logger = logging.getLogger("apex.distributed")

_client = None            # redis.Redis | None
_client_initialized = False
_client_lock = threading.Lock()

# Process-local reentrant locks per name — the disabled-mode fallback. Identical
# to the threading.RLock that context_manager used before this module existed.
_local_locks: dict[str, threading.RLock] = {}
_local_locks_guard = threading.Lock()

# Per-thread reentrancy bookkeeping for the distributed lock (mirrors RLock
# semantics: the same thread may re-acquire a lock it already holds).
_tls = threading.local()


def _get_client():
    """Lazily build the Redis client. Returns None when disabled/unreachable.

    A configured-but-unreachable Redis must never hard-fail requests: log once
    and fall back to local mode (degraded — only single-replica-safe — but the
    app stays up).
    """
    global _client, _client_initialized
    if _client_initialized:
        return _client
    with _client_lock:
        if _client_initialized:
            return _client
        url = os.getenv("REDIS_URL", "").strip()
        if url:
            try:
                import redis
                client = redis.Redis.from_url(
                    url, socket_connect_timeout=3, socket_timeout=3, decode_responses=True,
                )
                client.ping()
                _client = client
                _logger.info("distributed: Redis enabled (multi-replica coordination active)")
            except Exception as exc:  # noqa: BLE001 — any failure → local fallback
                _logger.error(
                    "distributed: REDIS_URL is set but Redis is unreachable (%s) — "
                    "falling back to local mode (single-replica-safe only)", exc,
                )
                _client = None
        _client_initialized = True
    return _client


def enabled() -> bool:
    """True when a reachable Redis backs distributed coordination."""
    return _get_client() is not None


def redis_client():
    """The shared Redis client, or None when disabled. For rate_limit.py."""
    return _get_client()


def reset_for_tests() -> None:
    """Drop the cached client so a test can flip REDIS_URL between cases."""
    global _client, _client_initialized
    with _client_lock:
        _client = None
        _client_initialized = False


def _local_lock(name: str) -> threading.RLock:
    with _local_locks_guard:
        lock = _local_locks.get(name)
        if lock is None:
            lock = threading.RLock()
            _local_locks[name] = lock
        return lock


@contextlib.contextmanager
def reentrant_lock(name: str, *, timeout: float = 30.0, blocking_timeout: float = 15.0):
    """Reentrant mutual exclusion around a named critical section.

    Disabled mode: a process-local ``threading.RLock`` (today's behaviour).

    Enabled mode: a Redis lock made reentrant via a per-thread depth counter —
    the first acquire takes the Redis lock, nested acquires on the same thread
    just increment, and the Redis lock is released when the depth returns to 0.
    Reentrancy is required because the index write lock is an RLock and its
    holders call other index functions that re-acquire it; a plain Redis lock
    would self-deadlock. ``timeout`` is the lock's auto-expiry (a crashed holder
    can't wedge every replica forever) — index/config writes are sub-second, so
    30s is ample headroom.
    """
    client = _get_client()
    if client is None:
        lock = _local_lock(name)
        lock.acquire()
        try:
            yield
        finally:
            lock.release()
        return

    depths = getattr(_tls, "depths", None)
    if depths is None:
        depths = _tls.depths = {}
    held = getattr(_tls, "held", None)
    if held is None:
        held = _tls.held = {}

    if depths.get(name, 0) > 0:  # reentrant: already held on this thread
        depths[name] += 1
        try:
            yield
        finally:
            depths[name] -= 1
        return

    import redis
    lock = client.lock(name, timeout=timeout, blocking_timeout=blocking_timeout)
    if not lock.acquire():
        raise TimeoutError(f"distributed lock {name!r} not acquired within {blocking_timeout}s")
    held[name] = lock
    depths[name] = 1
    try:
        yield
    finally:
        depths[name] -= 1
        if depths[name] == 0:
            held.pop(name, None)
            try:
                lock.release()
            except redis.exceptions.LockError:
                # Lock already expired (held past `timeout`) — nothing to release.
                _logger.warning("distributed lock %r expired before release", name)
