"""Unit tests for taiga_adapter.py — pure helper functions (no network calls)."""

import pytest
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# _web_base_url
# ---------------------------------------------------------------------------

class TestWebBaseUrl:
    def _url(self, api_url: str) -> str:
        import taiga_adapter
        with patch.object(taiga_adapter, "TAIGA_API_URL", api_url):
            return taiga_adapter._web_base_url()

    def test_taiga_cloud_strips_api_subdomain(self):
        assert self._url("https://api.taiga.io") == "https://taiga.io"

    def test_self_hosted_no_api_subdomain_unchanged(self):
        assert self._url("https://taiga.example.com") == "https://taiga.example.com"

    def test_strips_api_v1_path_suffix(self):
        assert self._url("https://taiga.example.com/api/v1") == "https://taiga.example.com"

    def test_strips_api_path_suffix(self):
        assert self._url("https://taiga.example.com/api") == "https://taiga.example.com"

    def test_trailing_slash_handled(self):
        result = self._url("https://api.taiga.io/")
        assert "api." not in result


# ---------------------------------------------------------------------------
# get_story_url
# ---------------------------------------------------------------------------

class TestGetStoryUrl:
    def test_returns_none_when_ref_is_none(self):
        import taiga_adapter
        assert taiga_adapter.get_story_url(None) is None

    def test_returns_none_when_project_has_no_slug(self):
        import taiga_adapter
        with patch.object(taiga_adapter, "get_project", return_value={}):
            result = taiga_adapter.get_story_url(42)
        assert result is None

    def test_builds_correct_url(self):
        import taiga_adapter
        with (
            patch.object(taiga_adapter, "get_project", return_value={"slug": "my-project"}),
            patch.object(taiga_adapter, "TAIGA_API_URL", "https://api.taiga.io"),
        ):
            result = taiga_adapter.get_story_url(42)
        assert result == "https://taiga.io/project/my-project/us/42"

    def test_self_hosted_url(self):
        import taiga_adapter
        with (
            patch.object(taiga_adapter, "get_project", return_value={"slug": "proj"}),
            patch.object(taiga_adapter, "TAIGA_API_URL", "https://taiga.acme.com"),
        ):
            result = taiga_adapter.get_story_url(7)
        assert result == "https://taiga.acme.com/project/proj/us/7"

    def test_returns_none_on_exception(self):
        import taiga_adapter
        with patch.object(taiga_adapter, "get_project", side_effect=Exception("boom")):
            result = taiga_adapter.get_story_url(1)
        assert result is None


# ---------------------------------------------------------------------------
# is_configured
# ---------------------------------------------------------------------------

class TestIsConfigured:
    def test_true_when_token_present(self):
        import taiga_adapter
        with patch.dict(taiga_adapter._token, {"value": "mytoken"}):
            assert taiga_adapter.is_configured() is True

    def test_true_when_username_and_password_present(self):
        import taiga_adapter
        with (
            patch.dict(taiga_adapter._token, {"value": ""}),
            patch.object(taiga_adapter, "TAIGA_USERNAME", "user"),
            patch.object(taiga_adapter, "TAIGA_PASSWORD", "pass"),
        ):
            assert taiga_adapter.is_configured() is True

    def test_false_when_nothing_configured(self):
        import taiga_adapter
        with (
            patch.dict(taiga_adapter._token, {"value": ""}),
            patch.object(taiga_adapter, "TAIGA_USERNAME", ""),
            patch.object(taiga_adapter, "TAIGA_PASSWORD", ""),
        ):
            assert taiga_adapter.is_configured() is False
