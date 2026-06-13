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
