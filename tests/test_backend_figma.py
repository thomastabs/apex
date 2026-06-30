"""Tests for the Figma catch-all proxy route in figma_proxy.py."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture(autouse=True)
def _clear_figma_cache():
    """Reset the proxy's GET cache + 429 cooldown so state never leaks between tests."""
    from backend.app.api import figma_proxy

    figma_proxy._cache.clear()
    figma_proxy._cooldown.clear()
    yield
    figma_proxy._cache.clear()
    figma_proxy._cooldown.clear()


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

    def test_get_200_cached_skips_second_upstream_call(self, client):
        upstream = _mock_upstream(200, {"name": "Cached File", "document": {}})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            r1 = client.get("/api/design/figma/files/CACHEKEY?depth=1", headers={"X-Figma-Token": TOKEN})
            r2 = client.get("/api/design/figma/files/CACHEKEY?depth=1", headers={"X-Figma-Token": TOKEN})
        assert r1.status_code == r2.status_code == 200
        assert r1.json() == r2.json()
        # Second identical GET served from cache — upstream hit only once.
        assert mock_http.request.call_count == 1

    def test_get_not_cached_across_distinct_tokens(self, client):
        upstream = _mock_upstream(200, {"ok": True})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            client.get("/api/design/figma/me", headers={"X-Figma-Token": TOKEN})
            client.get("/api/design/figma/me", headers={"X-Figma-Token": TOKEN + "-other"})
        # Cache key includes the token digest → no cross-token leakage.
        assert mock_http.request.call_count == 2

    def test_non_200_get_not_cached(self, client):
        upstream = _mock_upstream(404, {"err": "Not found"})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            client.get("/api/design/figma/files/X404?depth=1", headers={"X-Figma-Token": TOKEN})
            client.get("/api/design/figma/files/X404?depth=1", headers={"X-Figma-Token": TOKEN})
        # Errors must not be cached — both reach upstream.
        assert mock_http.request.call_count == 2

    def test_upstream_429_retried_then_succeeds(self, client):
        ok = _mock_upstream(200, {"name": "Recovered", "document": {}})
        throttled = _mock_upstream(429, {"err": "rate limited"})
        throttled.headers = {"content-type": "application/json", "retry-after": "0"}
        mock_http = MagicMock()
        mock_http.request = AsyncMock(side_effect=[throttled, ok])
        with patch("backend.app.api.figma_proxy._get_client", return_value=mock_http):
            resp = client.get("/api/design/figma/files/RETRY?depth=1", headers={"X-Figma-Token": TOKEN})
        assert resp.status_code == 200
        assert mock_http.request.call_count == 2

    def test_persistent_429_fails_fast_then_cooldown_skips_upstream(self, client):
        # Long Retry-After = real throttle: no in-request sleep-retry, single upstream hit.
        throttled = _mock_upstream(429, {"err": "rate limited"})
        throttled.headers = {"content-type": "application/json", "retry-after": "300"}
        patcher, mock_http = _patch_client(throttled)
        with patcher:
            r1 = client.get("/api/design/figma/files/HOT?depth=1", headers={"X-Figma-Token": TOKEN})
            # Second call is under cooldown → served locally, Figma untouched.
            r2 = client.get("/api/design/figma/files/HOT?depth=1", headers={"X-Figma-Token": TOKEN})
        assert r1.status_code == r2.status_code == 429
        assert mock_http.request.call_count == 1

    def test_force_header_bypasses_cooldown_and_reaches_figma(self, client):
        throttled = _mock_upstream(429, {"err": "rate limited"})
        throttled.headers = {"content-type": "application/json", "retry-after": "300"}
        ok = _mock_upstream(200, {"name": "Connected", "document": {}})
        mock_http = MagicMock()
        mock_http.request = AsyncMock(side_effect=[throttled, ok])
        with patch("backend.app.api.figma_proxy._get_client", return_value=mock_http):
            # First call trips the cooldown.
            r1 = client.get("/api/design/figma/files/CONN?depth=1", headers={"X-Figma-Token": TOKEN})
            # A normal retry would be short-circuited locally; X-Figma-Force reaches Figma.
            r2 = client.get(
                "/api/design/figma/files/CONN?depth=1",
                headers={"X-Figma-Token": TOKEN, "X-Figma-Force": "1"},
            )
        assert r1.status_code == 429
        assert r2.status_code == 200  # forced past the cooldown
        assert mock_http.request.call_count == 2

    def test_429_serves_stale_cached_200(self, client):
        ok = _mock_upstream(200, {"name": "Good", "document": {}})
        throttled = _mock_upstream(429, {"err": "rate limited"})
        throttled.headers = {"content-type": "application/json", "retry-after": "300"}
        from backend.app.api import figma_proxy

        mock_http = MagicMock()
        mock_http.request = AsyncMock(side_effect=[ok, throttled])
        with patch("backend.app.api.figma_proxy._get_client", return_value=mock_http):
            # Prime cache with a 200, then expire its fresh window so the next call
            # re-fetches upstream (which 429s) and must fall back to the stale 200.
            r1 = client.get("/api/design/figma/files/STALE?depth=1", headers={"X-Figma-Token": TOKEN})
            for k in list(figma_proxy._cache):
                stored, code, content, media = figma_proxy._cache[k]
                figma_proxy._cache[k] = (stored - figma_proxy._CACHE_TTL - 1, code, content, media)
            r2 = client.get("/api/design/figma/files/STALE?depth=1", headers={"X-Figma-Token": TOKEN})
        assert r1.status_code == 200
        assert r2.status_code == 200  # served stale despite upstream 429
        assert r2.json() == {"name": "Good", "document": {}}
        assert mock_http.request.call_count == 2

    def test_forced_429_serves_stale_so_sync_never_fails(self, client):
        # An explicit Sync forces past the cooldown to reach Figma; if Figma itself
        # 429s, the forced call must still return last-known-good rather than error.
        ok = _mock_upstream(200, {"name": "Good", "document": {}})
        throttled = _mock_upstream(429, {"err": "rate limited"})
        throttled.headers = {"content-type": "application/json", "retry-after": "300"}
        from backend.app.api import figma_proxy

        mock_http = MagicMock()
        mock_http.request = AsyncMock(side_effect=[ok, throttled])
        with patch("backend.app.api.figma_proxy._get_client", return_value=mock_http):
            r1 = client.get("/api/design/figma/files/FSTALE?depth=2", headers={"X-Figma-Token": TOKEN})
            for k in list(figma_proxy._cache):
                stored, code, content, media = figma_proxy._cache[k]
                figma_proxy._cache[k] = (stored - figma_proxy._CACHE_TTL - 1, code, content, media)
            r2 = client.get(
                "/api/design/figma/files/FSTALE?depth=2",
                headers={"X-Figma-Token": TOKEN, "X-Figma-Force": "1"},
            )
        assert r1.status_code == 200
        assert r2.status_code == 200  # forced reached Figma, 429'd, then served stale
        assert r2.json() == {"name": "Good", "document": {}}
        assert mock_http.request.call_count == 2


# ---------------------------------------------------------------------------
# figma_fetch — server-side helper (Autopilot seeding)
# ---------------------------------------------------------------------------

class TestFigmaFetch:
    _FILE = {
        "name": "ApexTest",
        "lastModified": "2026-06-27T10:00:00Z",
        "document": {
            "children": [
                {
                    "type": "CANVAS",
                    "name": "Flows",
                    "children": [
                        {"id": "1:1", "type": "FRAME", "name": "Login", "transitionNodeID": "1:2"},
                        {"id": "1:2", "type": "FRAME", "name": "Home"},
                        {"id": "1:3", "type": "RECTANGLE", "name": "ignore me"},
                    ],
                },
            ],
        },
    }

    def test_derive_frames_flows(self):
        from backend.app.services.figma_fetch import derive_frames_flows

        frames, flows = derive_frames_flows(self._FILE)
        assert [f["name"] for f in frames] == ["Login", "Home"]
        assert frames[0]["page"] == "Flows"
        assert flows == [{"from_name": "Login", "to_name": "Home"}]

    def test_build_context_markdown(self):
        from backend.app.services.figma_fetch import build_context_markdown

        md = build_context_markdown(self._FILE, [{"message": "fix spacing", "user": {"handle": "alice"}}])
        assert "# Figma Design Context" in md
        assert "**File:** ApexTest" in md
        assert "- Login" in md and "- Home" in md
        assert "Login → Home" in md
        assert "**alice:** fix spacing" in md

    def test_get_file_blocked_host(self, monkeypatch):
        from backend.app.services import figma_fetch

        monkeypatch.setattr(figma_fetch, "is_blocked_host", lambda h: True)
        with pytest.raises(figma_fetch.FigmaFetchError):
            figma_fetch.get_file("tok", "ABC123")

    def test_get_comments_swallows_errors(self, monkeypatch):
        from backend.app.services import figma_fetch

        def _boom(*a, **kw):
            raise figma_fetch.FigmaFetchError("401")

        monkeypatch.setattr(figma_fetch, "_get", _boom)
        assert figma_fetch.get_comments("tok", "ABC123") == []


class TestFigmaFrameImages:
    """U1 multimodal grounding — server-side frame image rendering + SSRF guard."""

    def test_get_image_urls_builds_query(self, monkeypatch):
        from backend.app.services import figma_fetch

        captured = {}

        def _fake_get(path, token, query=""):
            captured["path"] = path
            captured["query"] = query
            return {"images": {"1:1": "https://x/a.png", "1:2": None}}

        monkeypatch.setattr(figma_fetch, "_get", _fake_get)
        urls = figma_fetch.get_image_urls("tok", "ABC123", ["1:1", "1:2"])
        assert captured["path"] == "images/ABC123"
        assert "ids=1:1,1:2" in captured["query"] and "format=png" in captured["query"]
        # null render URLs are dropped
        assert urls == {"1:1": "https://x/a.png"}

    def test_image_host_allowed(self):
        from backend.app.services.figma_fetch import _image_host_allowed

        assert _image_host_allowed("figma-alpha-api.s3.us-west-2.amazonaws.com")
        assert _image_host_allowed("s3-alpha-sig.figma.com")
        assert not _image_host_allowed("evil.s3.amazonaws.com")  # no 'figma'
        assert not _image_host_allowed("evil.com")

    def test_fetch_image_bytes_rejects_non_https(self):
        from backend.app.services import figma_fetch

        with pytest.raises(figma_fetch.FigmaFetchError):
            figma_fetch.fetch_image_bytes("http://figma-alpha-api.s3.amazonaws.com/x.png")

    def test_fetch_image_bytes_rejects_foreign_host(self):
        from backend.app.services import figma_fetch

        with pytest.raises(figma_fetch.FigmaFetchError):
            figma_fetch.fetch_image_bytes("https://evil.com/x.png")

    def test_fetch_image_bytes_rejects_blocked_ip(self, monkeypatch):
        from backend.app.services import figma_fetch

        monkeypatch.setattr(figma_fetch, "is_blocked_host", lambda h: True)
        with pytest.raises(figma_fetch.FigmaFetchError):
            figma_fetch.fetch_image_bytes("https://figma-alpha-api.s3.us-west-2.amazonaws.com/x.png")

    def test_get_frame_images_caps_and_skips_failures(self, monkeypatch):
        from backend.app.services import figma_fetch

        # 15 frames → only the first _MAX_FRAME_IMAGES (12) are rendered.
        frames = [{"node_id": f"1:{i}", "name": f"S{i}"} for i in range(15)]
        rendered = {f"1:{i}": f"https://cdn/{i}.png" for i in range(12)}
        monkeypatch.setattr(figma_fetch, "get_image_urls", lambda *a, **k: rendered)

        def _fake_bytes(url):
            # one frame fails to download → skipped, not fatal
            if url.endswith("/3.png"):
                raise figma_fetch.FigmaFetchError("boom")
            return b"PNGDATA"

        monkeypatch.setattr(figma_fetch, "fetch_image_bytes", _fake_bytes)
        out = figma_fetch.get_frame_images("tok", "ABC123", frames)
        assert len(out) == 11  # 12 capped, 1 failure skipped
        assert all(set(o) == {"node_id", "name", "b64_png", "media_type"} for o in out)
        assert all(o["media_type"] == "image/png" for o in out)

    def test_get_frame_images_skips_frames_without_node_id(self, monkeypatch):
        from backend.app.services import figma_fetch

        monkeypatch.setattr(figma_fetch, "get_image_urls", lambda *a, **k: {})
        assert figma_fetch.get_frame_images("tok", "K", [{"name": "no-id"}]) == []

    def test_fetch_frame_images_is_advisory(self, monkeypatch):
        from backend.app.services import figma_fetch

        def _boom(*a, **kw):
            raise figma_fetch.FigmaFetchError("auth")

        monkeypatch.setattr(figma_fetch, "get_frame_images", _boom)
        # never raises — returns [] so the pipeline continues
        assert figma_fetch.fetch_frame_images("tok", "K", [{"node_id": "1:1"}]) == []
        # missing token/key short-circuits
        assert figma_fetch.fetch_frame_images("", "K", []) == []

    def test_fetch_frame_images_multi_groups_by_file(self, monkeypatch):
        from backend.app.services import figma_fetch

        calls = {}

        def _imgs(token, key, frames, max_frames=12):
            calls[key] = (max_frames, [f["node_id"] for f in frames])
            # echo back one rendered image per frame, keyed by raw node id
            return [{"node_id": f["node_id"], "name": f["name"], "b64_png": "X", "media_type": "image/png"} for f in frames]

        monkeypatch.setattr(figma_fetch, "get_frame_images", _imgs)
        frames = [
            {"node_id": "FILEA:1:1", "name": "Home"},
            {"node_id": "FILEA:1:2", "name": "List"},
            {"node_id": "FILEB:2:1", "name": "Settings"},
        ]
        out = figma_fetch.fetch_frame_images_multi("tok", frames, max_frames=12)
        # grouped by file; raw node ids passed to the renderer
        assert calls["FILEA"][1] == ["1:1", "1:2"]
        assert calls["FILEB"][1] == ["2:1"]
        # 12 budget / 2 files → 6 each
        assert calls["FILEA"][0] == 6 and calls["FILEB"][0] == 6
        # node_ids are remapped back to the namespaced form for traceability
        assert sorted(o["node_id"] for o in out) == ["FILEA:1:1", "FILEA:1:2", "FILEB:2:1"]

    def test_fetch_frame_images_multi_skips_unnamespaced_and_no_token(self, monkeypatch):
        from backend.app.services import figma_fetch

        monkeypatch.setattr(figma_fetch, "get_frame_images", lambda *a, **k: [])
        # frames without a `<file>:<raw>` node id are skipped → nothing to render
        assert figma_fetch.fetch_frame_images_multi("tok", [{"node_id": "1:1", "name": "X"}]) == []
        # missing token short-circuits
        assert figma_fetch.fetch_frame_images_multi("", [{"node_id": "K:1:1"}]) == []

    def test_fetch_frame_images_multi_advisory_on_file_error(self, monkeypatch):
        from backend.app.services import figma_fetch

        def _imgs(token, key, frames, max_frames=12):
            if key == "BAD":
                raise figma_fetch.FigmaFetchError("auth")
            return [{"node_id": frames[0]["node_id"], "name": "", "b64_png": "X", "media_type": "image/png"}]

        monkeypatch.setattr(figma_fetch, "get_frame_images", _imgs)
        out = figma_fetch.fetch_frame_images_multi("tok", [
            {"node_id": "GOOD:1:1", "name": "ok"}, {"node_id": "BAD:2:2", "name": "boom"},
        ])
        # the failing file is skipped, the good one still renders
        assert [o["node_id"] for o in out] == ["GOOD:1:1"]


class TestFigmaProjectIngest:
    """Stage 3 — file-as-epic project ingest."""

    def test_get_project_files_query(self, monkeypatch):
        from backend.app.services import figma_fetch

        captured = {}

        def _fake_get(path, token, query=""):
            captured["path"] = path
            return {"files": [{"key": "K1", "name": "Home"}, {"key": "K2", "name": "Settings"}]}

        monkeypatch.setattr(figma_fetch, "_get", _fake_get)
        files = figma_fetch.get_project_files("tok", "777")
        assert captured["path"] == "projects/777/files"
        assert [f["key"] for f in files] == ["K1", "K2"]

    def test_fetch_project_designs_bundles_and_image_cap(self, monkeypatch):
        from backend.app.services import figma_fetch

        monkeypatch.setattr(figma_fetch, "get_project_files", lambda t, p: [
            {"key": "K1", "name": "Home"}, {"key": "K2", "name": "Settings"},
        ])
        monkeypatch.setattr(figma_fetch, "get_file", lambda t, k, depth=2: {"name": k, "document": {}})
        monkeypatch.setattr(figma_fetch, "get_comments", lambda t, k: [])
        monkeypatch.setattr(figma_fetch, "derive_frames_flows", lambda f: ([{"node_id": "1:1", "name": "A", "page": "P"}], []))
        caps = {}

        def _imgs(token, key, frames, max_frames=12):
            caps[key] = max_frames
            return [{"node_id": "1:1", "name": "A", "b64_png": "X", "media_type": "image/png"}]

        monkeypatch.setattr(figma_fetch, "get_frame_images", _imgs)
        bundles = figma_fetch.fetch_project_designs("tok", "777", total_image_cap=16)
        assert [b["file_key"] for b in bundles] == ["K1", "K2"]
        assert [b["file_name"] for b in bundles] == ["Home", "Settings"]
        # 16 budget / 2 files → 8 each
        assert caps == {"K1": 8, "K2": 8}
        assert all(b["images"] for b in bundles)

    def test_fetch_project_designs_skips_bad_file(self, monkeypatch):
        from backend.app.services import figma_fetch

        monkeypatch.setattr(figma_fetch, "get_project_files", lambda t, p: [
            {"key": "GOOD", "name": "Good"}, {"key": "BAD", "name": "Bad"},
        ])

        def _get_file(t, k, depth=2):
            if k == "BAD":
                raise figma_fetch.FigmaFetchError("404")
            return {"name": k, "document": {}}

        monkeypatch.setattr(figma_fetch, "get_file", _get_file)
        monkeypatch.setattr(figma_fetch, "get_comments", lambda t, k: [])
        monkeypatch.setattr(figma_fetch, "derive_frames_flows", lambda f: ([], []))
        monkeypatch.setattr(figma_fetch, "get_frame_images", lambda *a, **k: [])
        bundles = figma_fetch.fetch_project_designs("tok", "777")
        assert [b["file_key"] for b in bundles] == ["GOOD"]

    def test_build_project_context_markdown_sections(self):
        from backend.app.services import figma_fetch

        md = figma_fetch.build_project_context_markdown([
            {"file_name": "Home", "context_md": "# Home ctx"},
            {"file_name": "Settings", "context_md": "# Settings ctx"},
        ])
        assert "# Figma Project Design Context" in md
        assert "## File: Home" in md and "## File: Settings" in md
        assert "# Home ctx" in md and "# Settings ctx" in md
