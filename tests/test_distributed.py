"""src/distributed.py — the env-flagged Redis coordination layer.

Default (no REDIS_URL) must behave exactly like the single-replica deployment;
enabled mode (fakeredis) must give a reentrant cross-replica lock and shared
rate-limit counters.
"""

import threading
import time

import pytest
from fastapi import HTTPException

from src import distributed

fakeredis = pytest.importorskip("fakeredis")


@pytest.fixture
def fake_redis(monkeypatch):
    client = fakeredis.FakeStrictRedis(decode_responses=True)
    monkeypatch.setattr(distributed, "_client", client)
    monkeypatch.setattr(distributed, "_client_initialized", True)
    distributed._tls.__dict__.clear()  # reset this thread's reentrancy depth
    yield client
    distributed.reset_for_tests()


# ── disabled mode (default) ──────────────────────────────────────────────────


def test_disabled_by_default(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    distributed.reset_for_tests()
    assert distributed.enabled() is False
    # Local fallback lock is reentrant (mirrors the old threading.RLock).
    with distributed.reentrant_lock("t"):
        with distributed.reentrant_lock("t"):
            pass


def test_unreachable_redis_falls_back_to_local(monkeypatch):
    monkeypatch.setenv("REDIS_URL", "rediss://default:nope@127.0.0.1:1/0")
    distributed.reset_for_tests()
    assert distributed.enabled() is False  # ping fails → local mode, no hard error
    distributed.reset_for_tests()


# ── enabled mode (fakeredis) ─────────────────────────────────────────────────


def test_enabled_with_redis(fake_redis):
    assert distributed.enabled() is True


def test_reentrant_under_redis(fake_redis):
    with distributed.reentrant_lock("apex:test"):
        assert fake_redis.get("apex:test") is not None      # held in Redis
        with distributed.reentrant_lock("apex:test"):        # nested, same thread
            with distributed.reentrant_lock("apex:test"):
                pass
    assert fake_redis.get("apex:test") is None               # released at depth 0


def test_redis_lock_serializes_across_threads(fake_redis):
    order: list[str] = []
    held = threading.Event()
    release = threading.Event()

    def holder():
        with distributed.reentrant_lock("apex:ser", blocking_timeout=5):
            order.append("h-acquire")
            held.set()
            release.wait(2)
            order.append("h-release")

    def waiter():
        held.wait(2)
        with distributed.reentrant_lock("apex:ser", blocking_timeout=5):
            order.append("w-acquire")

    t1, t2 = threading.Thread(target=holder), threading.Thread(target=waiter)
    t1.start()
    t2.start()
    time.sleep(0.3)            # waiter is now blocked on the held lock
    release.set()
    t1.join(3)
    t2.join(3)
    assert order == ["h-acquire", "h-release", "w-acquire"]


# ── shared rate-limit counters (the cross-replica security fix) ──────────────


def _req(ip="1.2.3.4"):
    from types import SimpleNamespace
    return SimpleNamespace(headers={"x-forwarded-for": ip}, client=SimpleNamespace(host=ip))


def test_auth_rate_limit_shared_across_replicas(fake_redis):
    from backend.app.api import rate_limit
    req = _req()
    for _ in range(rate_limit._MAX_AUTH_ATTEMPTS_PER_IP):
        rate_limit.auth_rate_limit(req)        # at limit, all allowed
    with pytest.raises(HTTPException) as ei:
        rate_limit.auth_rate_limit(req)        # one over → 429 (shared Redis counter)
    assert ei.value.status_code == 429


def test_auth_failure_throttle_shared(fake_redis):
    from backend.app.api import rate_limit
    req = _req("9.9.9.9")
    for _ in range(rate_limit._MAX_AUTH_FAILURES_PER_IP):
        rate_limit.record_auth_failure(req)
    with pytest.raises(HTTPException) as ei:
        rate_limit.check_auth_failures(req)
    assert ei.value.status_code == 429


def test_token_validation_cache_shared_via_redis(fake_redis):
    from backend.app.api import deps
    key = (deps._token_key("tok"), "https://pm.example/users/me")
    assert deps._cache_get(deps._token_cache, key) is None
    deps._cache_put(deps._token_cache, key, True)
    # Stored in Redis, not the local dict → a fresh "replica" (empty dict) sees it.
    assert deps._cache_get({}, key) is True
    assert fake_redis.get(deps._redis_cache_key(key)) == "1"
    # Negative validations are cached too (shorter TTL).
    bad = (deps._token_key("bad"), "https://pm.example/users/me")
    deps._cache_put(deps._token_cache, bad, False)
    assert deps._cache_get({}, bad) is False
