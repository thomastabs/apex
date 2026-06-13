"""Unit tests for get_auth_context dependency in deps.py."""

from collections import OrderedDict

import pytest
from fastapi import HTTPException

from backend.app.api import deps
from backend.app.api.deps import AuthContext, _MAX_TOKEN_LEN, get_auth_context


def _make_header(value: str) -> str:
    return value


class TestGetAuthContext:
    def test_valid_bearer_token_accepted(self):
        result = get_auth_context("Bearer mytoken123")
        assert isinstance(result, AuthContext)
        assert result.pm_token == "mytoken123"

    def test_strips_whitespace_from_token(self):
        result = get_auth_context("Bearer   spaced  ")
        assert result.pm_token == "spaced"

    def test_missing_header_raises_401(self):
        with pytest.raises(HTTPException) as exc:
            get_auth_context("")
        assert exc.value.status_code == 401

    def test_non_bearer_scheme_raises_401(self):
        with pytest.raises(HTTPException) as exc:
            get_auth_context("Basic dXNlcjpwYXNz")
        assert exc.value.status_code == 401

    def test_bearer_with_empty_token_raises_401(self):
        with pytest.raises(HTTPException) as exc:
            get_auth_context("Bearer ")
        assert exc.value.status_code == 401

    def test_token_at_max_length_accepted(self):
        token = "a" * _MAX_TOKEN_LEN
        result = get_auth_context(f"Bearer {token}")
        assert result.pm_token == token

    def test_token_exceeding_max_length_raises_400(self):
        token = "a" * (_MAX_TOKEN_LEN + 1)
        with pytest.raises(HTTPException) as exc:
            get_auth_context(f"Bearer {token}")
        assert exc.value.status_code == 400

    def test_carriage_return_in_header_raises_400(self):
        with pytest.raises(HTTPException) as exc:
            get_auth_context("Bearer token\r\nX-Evil: injected")
        assert exc.value.status_code == 400

    def test_newline_in_header_raises_400(self):
        with pytest.raises(HTTPException) as exc:
            get_auth_context("Bearer token\nX-Evil: injected")
        assert exc.value.status_code == 400

    def test_case_insensitive_bearer_prefix(self):
        result = get_auth_context("BEARER mytoken")
        assert result.pm_token == "mytoken"


class TestCacheEviction:
    """Audit M8: overflow must evict the least-recently-used entry, not nuke all."""

    def test_overflow_evicts_oldest_not_all(self, monkeypatch):
        cache = OrderedDict()
        monkeypatch.setattr(deps, "_CACHE_MAX_ENTRIES", 3)
        for k in ("a", "b", "c"):
            deps._cache_put(cache, k, True)
        # Touch "a" so it's most-recently-used; "b" is now the LRU.
        assert deps._cache_get(cache, "a") is True
        deps._cache_put(cache, "d", True)  # overflow → evict LRU ("b")

        assert "b" not in cache
        assert set(cache.keys()) == {"a", "c", "d"}  # not nuked to empty

    def test_overflow_sweeps_expired_first(self, monkeypatch):
        cache = OrderedDict()
        monkeypatch.setattr(deps, "_CACHE_MAX_ENTRIES", 2)
        monkeypatch.setattr(deps, "_INVALID_TTL", -1.0)  # immediately expired
        deps._cache_put(cache, "stale", False)           # expired on insert
        monkeypatch.setattr(deps, "_VALID_TTL", 60.0)
        deps._cache_put(cache, "fresh", True)
        deps._cache_put(cache, "new", True)              # overflow → expired "stale" swept

        assert "stale" not in cache
        assert "fresh" in cache and "new" in cache
