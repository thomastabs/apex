"""Tests for the Figma catch-all proxy route in figma_proxy.py."""

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
    return patch("backend.app.api.figma_proxy._get_client", return_value=mock_http), mock_http


TOKEN = "figd_test-token"


class TestProxyFigmaCatchAll:
    def test_get_forwarded_with_query_string(self, client):
        upstream = _mock_upstream(200, {"name": "My File", "document": {}})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = client.get(
                "/api/design/figma/files/ABC123?depth=2",
                headers={"X-Figma-Token": TOKEN},
            )
        assert resp.status_code == 200
        call = mock_http.request.call_args
        assert call.kwargs["method"] == "GET"
        # Host may be DNS-rebinding-pinned to an IP; the hostname then moves to
        # the Host header. Assert on the stable path + query either way.
        assert "/v1/files/ABC123" in call.kwargs["url"]
        assert "depth=2" in call.kwargs["url"]
        hdrs = call.kwargs["headers"]
        assert "api.figma.com" in call.kwargs["url"] or hdrs.get("Host") == "api.figma.com"
        assert hdrs["X-Figma-Token"] == TOKEN

    def test_token_is_trimmed_before_forwarding(self, client):
        upstream = _mock_upstream(200, {"ok": True})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = client.get(
                "/api/design/figma/me",
                headers={"X-Figma-Token": f"  {TOKEN}  "},
            )
        assert resp.status_code == 200
        assert mock_http.request.call_args.kwargs["headers"]["X-Figma-Token"] == TOKEN

    def test_upstream_status_and_body_passed_through(self, client):
        upstream = _mock_upstream(404, {"err": "Not found"})
        patcher, _ = _patch_client(upstream)
        with patcher:
            resp = client.get("/api/design/figma/files/missing", headers={"X-Figma-Token": TOKEN})
        assert resp.status_code == 404
        assert resp.json() == {"err": "Not found"}

    def test_missing_token_is_401(self, client):
        resp = client.get("/api/design/figma/files/ABC123")
        assert resp.status_code == 401

    def test_blank_token_is_401(self, client):
        resp = client.get("/api/design/figma/files/ABC123", headers={"X-Figma-Token": "   "})
        assert resp.status_code == 401

    def test_oversized_token_is_400(self, client):
        resp = client.get(
            "/api/design/figma/files/ABC123",
            headers={"X-Figma-Token": "x" * 2_001},
        )
        assert resp.status_code == 400

    def test_upstream_401_records_auth_failure(self, client):
        upstream = _mock_upstream(401, {"err": "Invalid token"})
        patcher, _ = _patch_client(upstream)
        with patch("backend.app.api.figma_proxy.record_auth_failure") as rec:
            with patcher:
                resp = client.get("/api/design/figma/me", headers={"X-Figma-Token": TOKEN})
        assert resp.status_code == 401
        rec.assert_called_once()

    def test_egress_allowlist_blocks_when_figma_not_listed(self, client, monkeypatch):
        # An allowlist that excludes api.figma.com → 403 before any upstream call.
        monkeypatch.setenv("EGRESS_HOST_ALLOWLIST", "example.com")
        resp = client.get("/api/design/figma/files/ABC123", headers={"X-Figma-Token": TOKEN})
        assert resp.status_code == 403

    def test_egress_allowlist_allows_when_figma_listed(self, client, monkeypatch):
        monkeypatch.setenv("EGRESS_HOST_ALLOWLIST", "api.figma.com,example.com")
        upstream = _mock_upstream(200, {"ok": True})
        patcher, _ = _patch_client(upstream)
        with patcher:
            resp = client.get("/api/design/figma/me", headers={"X-Figma-Token": TOKEN})
        assert resp.status_code == 200

    def test_connect_failure_maps_to_502(self, client):
        import httpx

        mock_http = MagicMock()
        mock_http.request = AsyncMock(side_effect=httpx.ConnectError("boom"))
        with patch("backend.app.api.figma_proxy._get_client", return_value=mock_http), \
             patch("backend.app.api.figma_proxy._reset_client", new=AsyncMock()):
            resp = client.get("/api/design/figma/me", headers={"X-Figma-Token": TOKEN})
        assert resp.status_code == 502

    def test_post_body_forwarded(self, client):
        upstream = _mock_upstream(200, {"ok": True})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = client.post(
                "/api/design/figma/files/ABC123/comments",
                headers={"X-Figma-Token": TOKEN},
                json={"message": "hi"},
            )
        assert resp.status_code == 200
        call = mock_http.request.call_args
        assert call.kwargs["method"] == "POST"
        assert json.loads(call.kwargs["content"]) == {"message": "hi"}
