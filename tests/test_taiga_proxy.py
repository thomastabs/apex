"""Tests for the Taiga catch-all proxy route in taiga_proxy.py."""

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
    return patch("backend.app.api.taiga_proxy._get_client", return_value=mock_http), mock_http


class TestProxyTaigaCatchAll:
    TAIGA_URL = "https://taiga.example.test/api/v1"
    AUTH = "Bearer mytoken"

    def test_get_forwarded_with_query_string(self, client):
        upstream = _mock_upstream(200, [{"id": 1}])
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = client.get(
                "/api/pm/taiga/epics?project=2&order_by=ref",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": self.TAIGA_URL},
            )
        assert resp.status_code == 200
        call_args = mock_http.request.call_args
        assert call_args.kwargs["method"] == "GET"
        assert "epics" in call_args.kwargs["url"]
        assert "project=2" in call_args.kwargs["url"]
        assert call_args.kwargs["headers"]["x-disable-pagination"] == "True"
        assert call_args.kwargs["headers"]["Authorization"] == self.AUTH

    def test_post_body_forwarded(self, client):
        upstream = _mock_upstream(200, {"id": 5, "subject": "Epic"})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = client.post(
                "/api/pm/taiga/epics",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": self.TAIGA_URL},
                json={"project": 2, "subject": "Epic", "description": "Desc"},
            )
        assert resp.status_code == 200
        call_args = mock_http.request.call_args
        assert call_args.kwargs["method"] == "POST"
        assert json.loads(call_args.kwargs["content"]) == {"project": 2, "subject": "Epic", "description": "Desc"}

    def test_patch_forwarded(self, client):
        upstream = _mock_upstream(200, {"id": 5, "version": 2})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = client.patch(
                "/api/pm/taiga/epics/5",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": self.TAIGA_URL},
                json={"version": 1, "subject": "Updated"},
            )
        assert resp.status_code == 200
        call_args = mock_http.request.call_args
        assert call_args.kwargs["method"] == "PATCH"

    def test_delete_forwarded(self, client):
        upstream = _mock_upstream(204, {})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = client.delete(
                "/api/pm/taiga/epics/5",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": self.TAIGA_URL},
            )
        assert resp.status_code == 204

    def test_upstream_4xx_forwarded_as_is(self, client):
        upstream = _mock_upstream(404, {"detail": "Not found"})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = client.get(
                "/api/pm/taiga/epics/999",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": self.TAIGA_URL},
            )
        assert resp.status_code == 404

    def test_missing_authorization_returns_401(self, client):
        resp = client.get(
            "/api/pm/taiga/epics",
            headers={"X-Taiga-Url": self.TAIGA_URL},
        )
        assert resp.status_code == 401

    def test_non_bearer_token_returns_401(self, client):
        resp = client.get(
            "/api/pm/taiga/epics",
            headers={"Authorization": "Basic dXNlcjpwYXNz", "X-Taiga-Url": self.TAIGA_URL},
        )
        assert resp.status_code == 401

    def test_ssrf_private_ip_blocked(self, client):
        resp = client.get(
            "/api/pm/taiga/epics",
            headers={"Authorization": self.AUTH, "X-Taiga-Url": "https://192.168.1.1/api/v1"},
        )
        assert resp.status_code == 400

    def test_ssrf_localhost_blocked(self, client):
        resp = client.get(
            "/api/pm/taiga/epics",
            headers={"Authorization": self.AUTH, "X-Taiga-Url": "https://localhost/api/v1"},
        )
        assert resp.status_code == 400

    def test_http_url_blocked(self, client):
        resp = client.get(
            "/api/pm/taiga/epics",
            headers={"Authorization": self.AUTH, "X-Taiga-Url": "http://taiga.example.test/api/v1"},
        )
        assert resp.status_code == 400

    def test_missing_x_taiga_url_with_no_config_returns_400(self, client):
        with patch("src.context_manager.load_config", return_value={"pm_tool": "jira"}):
            resp = client.get(
                "/api/pm/taiga/epics",
                headers={"Authorization": self.AUTH},
            )
        assert resp.status_code == 400

    def test_config_fallback_used_when_no_header(self, client):
        upstream = _mock_upstream(200, [])
        patcher, mock_http = _patch_client(upstream)
        config = {"pm_tool": "taiga", "taiga_url": "https://tree.taiga.io"}
        with patcher, patch("src.context_manager.load_config", return_value=config):
            resp = client.get(
                "/api/pm/taiga/userstories?project=1",
                headers={"Authorization": self.AUTH},
            )
        assert resp.status_code == 200
        called_url = mock_http.request.call_args.kwargs["url"]
        assert "api.taiga.io" in called_url
        assert "/api/v1/" in called_url

    def test_x_disable_pagination_always_sent_upstream(self, client):
        upstream = _mock_upstream(200, [])
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            client.get(
                "/api/pm/taiga/userstories?project=1",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": self.TAIGA_URL},
            )
        assert mock_http.request.call_args.kwargs["headers"]["x-disable-pagination"] == "True"

    def test_post_auth_still_uses_dedicated_handler(self, client):
        # POST /api/pm/taiga/auth must hit the specific /auth handler, not catch-all.
        # Verify by checking it rejects a missing X-Taiga-Url with the auth-specific error.
        resp = client.post(
            "/api/pm/taiga/auth",
            json={"username": "u", "password": "p", "type": "normal"},
        )
        assert resp.status_code == 400
        assert "X-Taiga-Url" in resp.json().get("detail", "")
