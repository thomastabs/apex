"""App-level middleware tests: security headers (M10) and body-size limit (M2)."""

from fastapi.testclient import TestClient

from backend.app.main import app, _MAX_BODY_BYTES

client = TestClient(app)


class TestSecurityHeaders:
    def test_health_carries_security_headers(self):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.headers["X-Content-Type-Options"] == "nosniff"
        assert resp.headers["Referrer-Policy"] == "no-referrer"
        assert resp.headers["Cache-Control"] == "no-store"


class TestCorsPreflight:
    def test_figma_token_header_allowed_in_preflight(self):
        # The browser preflights the Figma proxy because X-Figma-Token is a custom
        # header; the CORS allow_headers list must include it or the request 400s.
        resp = client.options(
            "/api/design/figma/files/ABC123",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "x-figma-token",
            },
        )
        assert resp.status_code == 200
        allowed = resp.headers.get("access-control-allow-headers", "").lower()
        assert "x-figma-token" in allowed


class TestAiUserKeysMiddleware:
    def test_cors_allows_ai_key_headers(self):
        # Custom headers must be preflight-allowlisted or the browser blocks the
        # request before it ever reaches the middleware that reads them.
        resp = client.options(
            "/api/workspace/ai-config",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "x-openai-api-key,x-google-api-key,x-anthropic-api-key",
            },
        )
        assert resp.status_code == 200
        allowed = resp.headers.get("access-control-allow-headers", "").lower()
        assert "x-openai-api-key" in allowed
        assert "x-google-api-key" in allowed
        assert "x-anthropic-api-key" in allowed

    def test_provider_key_headers_reach_ai_engine(self, monkeypatch):
        calls: list[dict] = []
        monkeypatch.setattr("src.ai_engine.set_user_api_keys", calls.append)
        resp = client.get("/api/health", headers={
            "X-Openai-Api-Key": "sk-test-key",
            "X-Google-Api-Key": "   ",  # blank after strip → excluded
        })
        assert resp.status_code == 200
        assert calls[-1] == {"openai": "sk-test-key"}

    def test_oversized_key_header_is_dropped(self, monkeypatch):
        calls: list[dict] = []
        monkeypatch.setattr("src.ai_engine.set_user_api_keys", calls.append)
        resp = client.get("/api/health", headers={"X-Openai-Api-Key": "x" * 600})
        assert resp.status_code == 200
        assert calls[-1] == {}

    def test_no_key_headers_still_calls_set_with_empty_dict(self, monkeypatch):
        # Confirms every request resets the ContextVar (even to {}), so a prior
        # request's key can never leak into a request that supplies none.
        calls: list[dict] = []
        monkeypatch.setattr("src.ai_engine.set_user_api_keys", calls.append)
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert calls == [{}]


class TestBodySizeLimit:
    def test_oversized_content_length_rejected_with_413(self):
        # Body over the limit with a Content-Length header → rejected before routing.
        big = b"x" * (_MAX_BODY_BYTES + 1)
        resp = client.post("/api/workspace/config", content=big)
        assert resp.status_code == 413

    def test_oversized_chunked_body_rejected_with_413(self):
        # A generator body has no Content-Length (chunked) — the middleware must
        # still drain and bail past the limit (audit M2, chunked branch).
        def gen():
            for _ in range(50):
                yield b"x" * 200_000  # ~10 MB total

        resp = client.post("/api/workspace/config", content=gen())
        assert resp.status_code == 413

    def test_normal_request_passes_through(self):
        # A small request flows through the body-size middleware untouched
        # (no token → auth rejects it, proving the body wasn't the blocker).
        resp = client.get("/api/health")
        assert resp.status_code == 200
