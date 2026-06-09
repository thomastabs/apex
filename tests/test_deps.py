"""Unit tests for get_auth_context dependency in deps.py."""

import pytest
from fastapi import HTTPException

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
