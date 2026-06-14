"""Tests for the Jira Cloud catch-all proxy route in jira_proxy.py."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def _mock_upstream(status_code: int, body: dict | list, content_type: str = "application/json"):
    resp = MagicMock()
    resp.content = json.dumps(body).encode()
    resp.status_code = status_code
    resp.headers = {"content-type": content_type}
    return resp


def _patch_client(response):
    mock_http = MagicMock()
    mock_http.request = AsyncMock(return_value=response)
    return patch("backend.app.api.jira_proxy._get_client", return_value=mock_http), mock_http


class TestProxyJiraCatchAll:
    JIRA_URL = "https://example.atlassian.net"
    AUTH = "Basic dXNlckBleGFtcGxlLmNvbTp0b2tlbg=="

    # ── Forwarding ────────────────────────────────────────────────────────────

    def test_get_forwarded_with_query_string(self, client):
        upstream = _mock_upstream(200, {"issues": []})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = client.get(
                "/api/pm/jira/search?jql=project%3DTEST&maxResults=50",
                headers={"Authorization": self.AUTH, "X-Jira-Base-Url": self.JIRA_URL},
            )
        assert resp.status_code == 200
        call_args = mock_http.request.call_args
        assert call_args.kwargs["method"] == "GET"
        assert call_args.kwargs["url"].startswith(f"{self.JIRA_URL}/rest/api/3/search")
        assert "maxResults=50" in call_args.kwargs["url"]
        assert call_args.kwargs["headers"]["Authorization"] == self.AUTH

    def test_post_body_forwarded(self, client):
        upstream = _mock_upstream(201, {"id": "10001", "key": "TEST-1"})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = client.post(
                "/api/pm/jira/issue",
                headers={"Authorization": self.AUTH, "X-Jira-Base-Url": self.JIRA_URL},
                json={"fields": {"summary": "New issue"}},
            )
        assert resp.status_code == 201
        call_args = mock_http.request.call_args
        assert call_args.kwargs["method"] == "POST"
        assert json.loads(call_args.kwargs["content"]) == {"fields": {"summary": "New issue"}}

    def test_rest_api_3_prefix_always_applied(self, client):
        upstream = _mock_upstream(200, {})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            client.get(
                "/api/pm/jira/myself",
                headers={"Authorization": self.AUTH, "X-Jira-Base-Url": self.JIRA_URL},
            )
        assert mock_http.request.call_args.kwargs["url"] == f"{self.JIRA_URL}/rest/api/3/myself"

    def test_upstream_4xx_forwarded_as_is(self, client):
        upstream = _mock_upstream(404, {"errorMessages": ["Issue does not exist"]})
        patcher, _ = _patch_client(upstream)
        with patcher:
            resp = client.get(
                "/api/pm/jira/issue/TEST-999",
                headers={"Authorization": self.AUTH, "X-Jira-Base-Url": self.JIRA_URL},
            )
        assert resp.status_code == 404

    # ── Auth header validation ────────────────────────────────────────────────

    def test_missing_authorization_returns_401(self, client):
        resp = client.get(
            "/api/pm/jira/myself",
            headers={"X-Jira-Base-Url": self.JIRA_URL},
        )
        assert resp.status_code == 401

    def test_bearer_token_rejected(self, client):
        resp = client.get(
            "/api/pm/jira/myself",
            headers={"Authorization": "Bearer sometoken", "X-Jira-Base-Url": self.JIRA_URL},
        )
        assert resp.status_code == 401

    def test_header_injection_blocked(self, client):
        resp = client.get(
            "/api/pm/jira/myself",
            headers={"Authorization": "Basic abc\r\nX-Evil: injected", "X-Jira-Base-Url": self.JIRA_URL},
        )
        assert resp.status_code in (400, 401)

    def test_oversized_token_blocked(self, client):
        resp = client.get(
            "/api/pm/jira/myself",
            headers={"Authorization": "Basic " + "a" * 2001, "X-Jira-Base-Url": self.JIRA_URL},
        )
        assert resp.status_code == 400

    # ── SSRF guard on X-Jira-Base-Url override ───────────────────────────────

    def test_non_atlassian_domain_blocked(self, client):
        resp = client.get(
            "/api/pm/jira/myself",
            headers={"Authorization": self.AUTH, "X-Jira-Base-Url": "https://evil.example.com"},
        )
        assert resp.status_code == 400

    def test_atlassian_suffix_spoof_blocked(self, client):
        # evilatlassian.net is NOT *.atlassian.net — suffix match must be label-aware
        resp = client.get(
            "/api/pm/jira/myself",
            headers={"Authorization": self.AUTH, "X-Jira-Base-Url": "https://evilatlassian.net"},
        )
        assert resp.status_code == 400

    def test_http_url_blocked(self, client):
        resp = client.get(
            "/api/pm/jira/myself",
            headers={"Authorization": self.AUTH, "X-Jira-Base-Url": "http://example.atlassian.net"},
        )
        assert resp.status_code == 400

    def test_private_ip_blocked(self, client):
        resp = client.get(
            "/api/pm/jira/myself",
            headers={"Authorization": self.AUTH, "X-Jira-Base-Url": "https://192.168.1.1"},
        )
        assert resp.status_code == 400

    def test_link_local_blocked(self, client):
        resp = client.get(
            "/api/pm/jira/myself",
            headers={"Authorization": self.AUTH, "X-Jira-Base-Url": "https://169.254.169.254"},
        )
        assert resp.status_code == 400

    def test_localhost_blocked(self, client):
        resp = client.get(
            "/api/pm/jira/myself",
            headers={"Authorization": self.AUTH, "X-Jira-Base-Url": "https://localhost"},
        )
        assert resp.status_code == 400

    # ── Config fallback ───────────────────────────────────────────────────────

    def test_config_fallback_used_when_no_header(self, client):
        upstream = _mock_upstream(200, {})
        patcher, mock_http = _patch_client(upstream)
        config = {"pm_tool": "jira", "jira_base_url": "https://example.atlassian.net"}
        with patcher, patch("src.context_manager.load_config", return_value=config):
            resp = client.get(
                "/api/pm/jira/myself",
                headers={"Authorization": self.AUTH},
            )
        assert resp.status_code == 200
        assert mock_http.request.call_args.kwargs["url"].startswith("https://example.atlassian.net/rest/api/3/")

    def test_config_not_jira_returns_400(self, client):
        with patch("src.context_manager.load_config", return_value={"pm_tool": "taiga"}):
            resp = client.get(
                "/api/pm/jira/myself",
                headers={"Authorization": self.AUTH},
            )
        assert resp.status_code == 400

    def test_config_missing_base_url_returns_400(self, client):
        with patch("src.context_manager.load_config", return_value={"pm_tool": "jira"}):
            resp = client.get(
                "/api/pm/jira/myself",
                headers={"Authorization": self.AUTH},
            )
        assert resp.status_code == 400


class TestJiraConfigPathSsrf:
    """The persisted jira_base_url is user-writable — the config path must
    enforce the same https + atlassian.net + non-private rules as the
    X-Jira-Base-Url header (audit C3)."""

    AUTH = "Basic dXNlckBleGFtcGxlLmNvbTp0b2tlbg=="

    def _get_with_config(self, client, base_url: str):
        config = {"pm_tool": "jira", "jira_base_url": base_url}
        with patch("src.context_manager.load_config", return_value=config):
            return client.get("/api/pm/jira/myself", headers={"Authorization": self.AUTH})

    def test_config_non_atlassian_blocked(self, client):
        assert self._get_with_config(client, "https://evil.example.com").status_code == 400

    def test_config_private_ip_blocked(self, client):
        assert self._get_with_config(client, "https://169.254.169.254").status_code == 400

    def test_config_http_blocked(self, client):
        assert self._get_with_config(client, "http://example.atlassian.net").status_code == 400

    def test_dns_rebinding_on_atlassian_name_blocked(self, client):
        with patch(
            "backend.app.api.ssrf.socket.getaddrinfo",
            return_value=[(2, 1, 6, "", ("10.0.0.5", 0))],
        ):
            resp = client.get(
                "/api/pm/jira/myself",
                headers={"Authorization": self.AUTH, "X-Jira-Base-Url": "https://rebind.atlassian.net"},
            )
        assert resp.status_code == 400


class TestSaveConfigValidation:
    """POST /workspace/config must reject bad jira_base_url at save time."""

    HEADERS = {"Authorization": "Bearer tok"}

    def test_save_non_atlassian_jira_url_rejected(self, client):
        resp = client.post(
            "/api/workspace/config",
            headers=self.HEADERS,
            json={"pm_tool": "jira", "jira_base_url": "https://evil.example.com"},
        )
        assert resp.status_code == 400

    def test_save_http_jira_url_rejected(self, client):
        resp = client.post(
            "/api/workspace/config",
            headers=self.HEADERS,
            json={"pm_tool": "jira", "jira_base_url": "http://example.atlassian.net"},
        )
        assert resp.status_code == 400

    def test_save_valid_jira_url_accepted(self, client):
        saved: dict = {}

        def fake_save_pm_config(pm_tool=None, jira_base_url=None, taiga_url=None):
            saved["pm_tool"] = pm_tool
            saved["jira_base_url"] = jira_base_url

        with patch("src.context_manager.save_pm_config", side_effect=fake_save_pm_config):
            resp = client.post(
                "/api/workspace/config",
                headers=self.HEADERS,
                json={"pm_tool": "jira", "jira_base_url": "https://example.atlassian.net"},
            )
        assert resp.status_code == 200
        assert saved == {"pm_tool": "jira", "jira_base_url": "https://example.atlassian.net"}

    def test_save_empty_jira_url_allowed_to_clear(self, client):
        with patch("src.context_manager.save_pm_config") as mock_save:
            resp = client.post(
                "/api/workspace/config",
                headers=self.HEADERS,
                json={"pm_tool": "taiga", "jira_base_url": ""},
            )
        assert resp.status_code == 200
        mock_save.assert_called_once()


class TestJiraAuthBackoff:
    """Every Jira request carries Basic credentials, so the proxy backs off
    IPs with repeated upstream 401s instead of capping all traffic (audit H1)."""

    BASE = "https://example.atlassian.net"
    AUTH = "Basic cHJvYmU6cHJvYmU="

    def _get(self, client):
        return client.get(
            "/api/pm/jira/myself",
            headers={"X-Jira-Base-Url": self.BASE, "Authorization": self.AUTH},
        )

    def test_upstream_401_recorded(self, client):
        from backend.app.api import rate_limit
        upstream = _mock_upstream(401, {"errorMessages": ["bad creds"]})
        patcher, _ = _patch_client(upstream)
        with patcher:
            assert self._get(client).status_code == 401
        assert rate_limit._failure_buckets["authfail:testclient"][1] == 1

    def test_backoff_blocks_after_threshold(self, client):
        import time as _time
        from backend.app.api import rate_limit
        rate_limit._failure_buckets["authfail:testclient"] = (
            _time.monotonic(), rate_limit._MAX_AUTH_FAILURES_PER_IP,
        )
        upstream = _mock_upstream(200, {"accountId": "x"})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = self._get(client)
        assert resp.status_code == 429
        mock_http.request.assert_not_called()

    def test_successful_requests_unaffected(self, client):
        from backend.app.api import rate_limit
        upstream = _mock_upstream(200, {"accountId": "x"})
        patcher, _ = _patch_client(upstream)
        with patcher:
            assert self._get(client).status_code == 200
        assert "authfail:testclient" not in rate_limit._failure_buckets


class TestSelfHeal:
    """Connect-level failures reset the pooled client and retry (up to 2×);
    read-level failures never retry. Shared with Taiga via pm_http."""

    JIRA_URL = "https://example.atlassian.net"
    AUTH = "Basic dXNlckBleGFtcGxlLmNvbTp0b2tlbg=="

    @pytest.fixture(autouse=True)
    def _no_backoff(self):
        with patch("backend.app.api.pm_http.asyncio.sleep", AsyncMock()):
            yield

    def _get(self, client):
        return client.get(
            "/api/pm/jira/myself",
            headers={"Authorization": self.AUTH, "X-Jira-Base-Url": self.JIRA_URL},
        )

    def test_connect_error_retried_and_succeeds(self, client):
        import httpx as _httpx
        upstream = _mock_upstream(200, {"accountId": "x"})
        mock_http = MagicMock()
        mock_http.request = AsyncMock(side_effect=[_httpx.ConnectError("dropped"), upstream])
        mock_http.is_closed = False
        mock_http.aclose = AsyncMock()
        with patch("backend.app.api.jira_proxy._get_client", return_value=mock_http):
            resp = self._get(client)
        assert resp.status_code == 200
        assert mock_http.request.call_count == 2

    def test_connect_failures_exhaust_retries_and_map_to_502(self, client):
        import httpx as _httpx
        mock_http = MagicMock()
        mock_http.request = AsyncMock(side_effect=_httpx.ConnectTimeout("still dead"))
        mock_http.is_closed = False
        mock_http.aclose = AsyncMock()
        with patch("backend.app.api.jira_proxy._get_client", return_value=mock_http):
            resp = self._get(client)
        assert resp.status_code == 502
        assert mock_http.request.call_count == 3

    def test_read_errors_not_retried(self, client):
        import httpx as _httpx
        mock_http = MagicMock()
        mock_http.request = AsyncMock(side_effect=_httpx.ReadTimeout("slow upstream"))
        with patch("backend.app.api.jira_proxy._get_client", return_value=mock_http):
            resp = self._get(client)
        assert resp.status_code == 502
        assert mock_http.request.call_count == 1
