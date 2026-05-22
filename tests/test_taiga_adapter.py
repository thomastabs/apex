"""Unit tests for taiga_adapter.py — _web_base_url URL derivation."""

from unittest.mock import patch


class TestWebBaseUrl:
    def _url(self, api_url: str) -> str:
        from src import taiga_adapter
        with patch.object(taiga_adapter, "TAIGA_API_URL", api_url):
            return taiga_adapter._web_base_url()

    def test_taiga_cloud_strips_api_subdomain(self):
        assert self._url("https://api.taiga.io") == "https://tree.taiga.io"

    def test_self_hosted_no_api_subdomain_unchanged(self):
        assert self._url("https://taiga.example.com") == "https://taiga.example.com"

    def test_strips_api_v1_path_suffix(self):
        assert self._url("https://taiga.example.com/api/v1") == "https://taiga.example.com"

    def test_strips_api_path_suffix(self):
        assert self._url("https://taiga.example.com/api") == "https://taiga.example.com"

    def test_trailing_slash_handled(self):
        result = self._url("https://api.taiga.io/")
        assert "api." not in result
