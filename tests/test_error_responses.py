"""Global error-response shape: everything the client sees is `{"detail": ...}`.

The frontend parses `detail` uniformly (lib/api/client.ts), so any route that
answers with a different shape produces an unreadable toast.
"""

from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app, raise_server_exceptions=False)


class TestBodyLimitResponses:
    def test_bad_content_length_returns_json_detail(self):
        resp = client.post(
            "/api/health", headers={"Content-Length": "not-a-number"}, content=b"",
        )
        assert resp.status_code == 400
        # Was `Response("Invalid Content-Length header.")` i.e. text/plain, which
        # the frontend's JSON parser could not read.
        assert resp.headers["content-type"].startswith("application/json")
        assert "Content-Length" in resp.json()["detail"]

    def test_oversized_body_returns_json_detail(self):
        resp = client.post(
            "/api/health",
            headers={"Content-Length": str(5 * 1024 * 1024), "Content-Type": "application/json"},
            content=b"{}",
        )
        assert resp.status_code == 413
        assert resp.headers["content-type"].startswith("application/json")
        assert "too large" in resp.json()["detail"]


class TestValidationErrors:
    def test_request_validation_returns_a_readable_string(self):
        # No auth headers and an empty body: FastAPI's own validation fires.
        resp = client.post("/api/pm/taiga/auth", json={}, headers={"X-Taiga-Url": "https://api.taiga.io"})
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        # Previously the raw [{loc, msg, type}] list; now a flat sentence that
        # names the offending fields.
        assert isinstance(detail, str)
        assert "username" in detail
        assert "password" in detail


class TestLockTimeout:
    def test_lock_timeout_is_a_503_busy_not_a_500(self):
        @app.get("/api/_test_lock_timeout")
        def _boom():
            raise TimeoutError("distributed lock 'apex:story-index' not acquired within 15.0s")

        try:
            resp = client.get("/api/_test_lock_timeout")
            assert resp.status_code == 503
            assert resp.json()["detail"]["code"] == "workspace_busy"
            assert "busy" in resp.json()["detail"]["message"].lower()
        finally:
            app.router.routes = [
                r for r in app.router.routes if getattr(r, "path", None) != "/api/_test_lock_timeout"
            ]


class TestHealth:
    def test_health_still_ok(self):
        assert client.get("/api/health").json() == {"status": "ok"}
