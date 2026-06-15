"""Tests for the Taiga catch-all proxy route in taiga_proxy.py."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
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

    def test_ssrf_172_16_blocked(self, client):
        resp = client.get(
            "/api/pm/taiga/epics",
            headers={"Authorization": self.AUTH, "X-Taiga-Url": "https://172.16.0.1/api/v1"},
        )
        assert resp.status_code == 400

    def test_ssrf_link_local_blocked(self, client):
        resp = client.get(
            "/api/pm/taiga/epics",
            headers={"Authorization": self.AUTH, "X-Taiga-Url": "https://169.254.169.254/api/v1"},
        )
        assert resp.status_code == 400

    def test_ssrf_cgnat_blocked(self, client):
        resp = client.get(
            "/api/pm/taiga/epics",
            headers={"Authorization": self.AUTH, "X-Taiga-Url": "https://100.64.0.1/api/v1"},
        )
        assert resp.status_code == 400

    def test_ssrf_localhost_blocked(self, client):
        resp = client.get(
            "/api/pm/taiga/epics",
            headers={"Authorization": self.AUTH, "X-Taiga-Url": "https://localhost/api/v1"},
        )
        assert resp.status_code == 400

    def test_header_injection_blocked(self, client):
        resp = client.get(
            "/api/pm/taiga/epics",
            headers={"Authorization": "Bearer token\r\nX-Evil: injected", "X-Taiga-Url": self.TAIGA_URL},
        )
        assert resp.status_code in (400, 401)

    def test_oversized_token_blocked(self, client):
        big_token = "Bearer " + "a" * 2001
        resp = client.get(
            "/api/pm/taiga/epics",
            headers={"Authorization": big_token, "X-Taiga-Url": self.TAIGA_URL},
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


def _mock_auth_upstream(status_code: int, body: dict):
    resp = MagicMock()
    resp.content = json.dumps(body).encode()
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.json = MagicMock(return_value=body)
    return resp


class TestUsernameBruteForce:
    """Per-account credential-stuffing throttle (security gap #2): forging
    X-Forwarded-For must not let an attacker bypass it for one account."""

    URL = "https://taiga.example.test"

    def test_per_username_throttle_unit(self):
        from backend.app.api import rate_limit as rl
        for _ in range(rl._MAX_AUTH_FAILURES_PER_USER):
            rl.record_username_failure("victim")
        with pytest.raises(HTTPException) as exc:
            rl.check_username_failures("victim")
        assert exc.value.status_code == 429
        # A different account is untouched.
        rl.check_username_failures("someone-else")

    def test_username_match_is_case_insensitive(self):
        from backend.app.api import rate_limit as rl
        for _ in range(rl._MAX_AUTH_FAILURES_PER_USER):
            rl.record_username_failure("Victim")
        with pytest.raises(HTTPException):
            rl.check_username_failures("victim ")  # normalised before hashing

    def test_ip_rotation_does_not_bypass_account_throttle(self, client):
        from backend.app.api import rate_limit as rl
        patcher, _ = _patch_client(_mock_auth_upstream(401, {"_error_message": "bad creds"}))
        with patcher:
            last = None
            for i in range(rl._MAX_AUTH_FAILURES_PER_USER + 1):
                last = client.post(
                    "/api/pm/taiga/auth",
                    json={"username": "victim", "password": "guess", "type": "normal"},
                    headers={"X-Taiga-Url": self.URL, "X-Forwarded-For": f"203.0.113.{i}"},
                )
        # Each attempt came from a distinct (spoofed) IP, yet the account-keyed
        # counter still trips once the per-user ceiling is hit.
        assert last is not None and last.status_code == 429


class TestTaigaConfigPathSsrf:
    """The workspace-config URL is user-writable — it must pass the same
    SSRF guard as the X-Taiga-Url header (audit C3)."""

    AUTH = "Bearer mytoken"

    def _get_with_config(self, client, taiga_url: str):
        config = {"pm_tool": "taiga", "taiga_url": taiga_url}
        with patch("src.context_manager.load_config", return_value=config):
            return client.get("/api/pm/taiga/epics", headers={"Authorization": self.AUTH})

    def test_config_private_ip_blocked(self, client):
        assert self._get_with_config(client, "https://192.168.1.50").status_code == 400

    def test_config_link_local_blocked(self, client):
        assert self._get_with_config(client, "https://169.254.169.254").status_code == 400

    def test_config_localhost_blocked(self, client):
        assert self._get_with_config(client, "https://localhost:9000").status_code == 400

    def test_config_http_blocked(self, client):
        assert self._get_with_config(client, "http://taiga.example.test").status_code == 400


class TestTaigaDnsRebinding:
    """Public-looking hostnames resolving to private addresses must be
    blocked (audit H3)."""

    AUTH = "Bearer mytoken"

    @staticmethod
    def _addrinfo(ip: str):
        return [(2, 1, 6, "", (ip, 0))]

    def test_hostname_resolving_to_private_blocked(self, client):
        with patch("backend.app.api.ssrf.socket.getaddrinfo", return_value=self._addrinfo("10.0.0.5")):
            resp = client.get(
                "/api/pm/taiga/epics",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": "https://rebind.example.com/api/v1"},
            )
        assert resp.status_code == 400

    def test_hostname_resolving_to_metadata_ip_blocked(self, client):
        with patch("backend.app.api.ssrf.socket.getaddrinfo", return_value=self._addrinfo("169.254.169.254")):
            resp = client.get(
                "/api/pm/taiga/epics",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": "https://rebind.example.com/api/v1"},
            )
        assert resp.status_code == 400

    def test_hostname_resolving_to_public_allowed(self, client):
        upstream = _mock_upstream(200, [])
        patcher, _ = _patch_client(upstream)
        with patcher, patch("backend.app.api.ssrf.socket.getaddrinfo", return_value=self._addrinfo("93.184.216.34")):
            resp = client.get(
                "/api/pm/taiga/epics",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": "https://public.example.com/api/v1"},
            )
        assert resp.status_code == 200

    def test_unresolvable_hostname_allowed_through_guard(self, client):
        # Connection will fail downstream anyway; blocking on resolver errors
        # would break offline/CI runs.
        upstream = _mock_upstream(200, [])
        patcher, _ = _patch_client(upstream)
        with patcher, patch("backend.app.api.ssrf.socket.getaddrinfo", side_effect=OSError("NXDOMAIN")):
            resp = client.get(
                "/api/pm/taiga/epics",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": "https://nxdomain.example.com/api/v1"},
            )
        assert resp.status_code == 200


class TestSelfHeal:
    """A connect-level failure resets the pooled client and retries (up to 2×)
    with backoff — Azure SNAT paths can die while the pool keeps reusing them."""

    AUTH = "Bearer mytoken"
    TAIGA_URL = "https://taiga.example.test/api/v1"

    @pytest.fixture(autouse=True)
    def _no_backoff(self):
        # Skip the real jittered sleeps between retries so the suite stays fast.
        with patch("backend.app.api.pm_http.asyncio.sleep", AsyncMock()):
            yield

    def test_connect_error_retried_once_and_succeeds(self, client):
        import httpx as _httpx
        upstream = _mock_upstream(200, {"ok": True})
        mock_http = MagicMock()
        mock_http.request = AsyncMock(side_effect=[_httpx.ConnectError("dropped"), upstream])
        mock_http.is_closed = False
        mock_http.aclose = AsyncMock()
        with patch("backend.app.api.taiga_proxy._get_client", return_value=mock_http):
            resp = client.get(
                "/api/pm/taiga/epics",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": self.TAIGA_URL},
            )
        assert resp.status_code == 200
        assert mock_http.request.call_count == 2

    def test_two_connect_failures_then_success(self, client):
        import httpx as _httpx
        upstream = _mock_upstream(200, {"ok": True})
        mock_http = MagicMock()
        mock_http.request = AsyncMock(
            side_effect=[_httpx.ConnectError("drop1"), _httpx.ConnectTimeout("drop2"), upstream]
        )
        mock_http.is_closed = False
        mock_http.aclose = AsyncMock()
        with patch("backend.app.api.taiga_proxy._get_client", return_value=mock_http):
            resp = client.get(
                "/api/pm/taiga/epics",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": self.TAIGA_URL},
            )
        assert resp.status_code == 200
        assert mock_http.request.call_count == 3

    def test_connect_failures_exhaust_retries_and_map_to_502(self, client):
        # 1 initial attempt + 2 retries, all failing → surfaces as 502.
        import httpx as _httpx
        mock_http = MagicMock()
        mock_http.request = AsyncMock(side_effect=_httpx.ConnectTimeout("still dead"))
        mock_http.is_closed = False
        mock_http.aclose = AsyncMock()
        with patch("backend.app.api.taiga_proxy._get_client", return_value=mock_http):
            resp = client.get(
                "/api/pm/taiga/epics",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": self.TAIGA_URL},
            )
        assert resp.status_code == 502
        assert mock_http.request.call_count == 3

    def test_read_errors_not_retried(self, client):
        # Only connect-level failures indicate a dead pool; read timeouts mean
        # the upstream accepted the connection — retrying would double AI-cost
        # operations behind the proxy.
        import httpx as _httpx
        mock_http = MagicMock()
        mock_http.request = AsyncMock(side_effect=_httpx.ReadTimeout("slow upstream"))
        with patch("backend.app.api.taiga_proxy._get_client", return_value=mock_http):
            resp = client.get(
                "/api/pm/taiga/epics",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": self.TAIGA_URL},
            )
        assert resp.status_code == 502
        assert mock_http.request.call_count == 1


class TestAuthBruteForceProtection:
    """The /auth relay caps attempts per IP and backs off after repeated
    upstream credential rejections (audit H1)."""

    URL = "https://taiga.example.test"

    def _login(self, client):
        return client.post(
            "/api/pm/taiga/auth",
            json={"username": "u", "password": "wrong", "type": "normal"},
            headers={"X-Taiga-Url": self.URL},
        )

    @staticmethod
    def _auth_upstream(status_code: int, body: dict):
        # The auth handler (unlike the catch-all) calls resp.json() and
        # resp.is_success — configure both on the mock.
        resp = _mock_upstream(status_code, body)
        resp.json.return_value = body
        resp.is_success = 200 <= status_code < 300
        return resp

    def test_attempt_cap_per_ip(self, client):
        upstream = self._auth_upstream(401, {"detail": "bad credentials"})
        patcher, _ = _patch_client(upstream)
        from backend.app.api import rate_limit
        # Distinct usernames per attempt so the per-account failure throttle
        # never trips — this isolates the per-IP *attempt* cap.
        def _login_as(name: str):
            return client.post(
                "/api/pm/taiga/auth",
                json={"username": name, "password": "wrong", "type": "normal"},
                headers={"X-Taiga-Url": self.URL},
            )
        with patcher:
            for i in range(rate_limit._MAX_AUTH_ATTEMPTS_PER_IP):
                assert _login_as(f"user{i}").status_code == 401
            resp = _login_as("user-final")
        assert resp.status_code == 429
        assert "sign-in attempts" in resp.json()["detail"]

    def test_failure_backoff_blocks_before_forwarding(self, client):
        from backend.app.api import rate_limit
        # Simulate an IP that already exhausted its failure budget.
        import time as _time
        rate_limit._failure_buckets["authfail:testclient"] = (
            _time.monotonic(), rate_limit._MAX_AUTH_FAILURES_PER_IP,
        )
        upstream = self._auth_upstream(200, {"auth_token": "tok"})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = self._login(client)
        assert resp.status_code == 429
        assert "failed PM sign-in" in resp.json()["detail"]
        mock_http.request.assert_not_called()  # rejected before reaching Taiga

    def test_upstream_rejection_recorded(self, client):
        from backend.app.api import rate_limit
        upstream = self._auth_upstream(401, {"detail": "bad credentials"})
        patcher, _ = _patch_client(upstream)
        with patcher:
            self._login(client)
        assert rate_limit._failure_buckets["authfail:testclient"][1] == 1

    def test_successful_login_not_counted_as_failure(self, client):
        from backend.app.api import rate_limit
        upstream = self._auth_upstream(200, {"auth_token": "tok"})
        patcher, _ = _patch_client(upstream)
        with patcher:
            resp = self._login(client)
        assert resp.status_code == 200
        assert "authfail:testclient" not in rate_limit._failure_buckets


class TestEgressRelay:
    """When TAIGA_EGRESS_RELAY is set, requests go to the Worker with the real
    target in X-Relay-Target (Taiga blocks Azure egress — see infra/cloudflare)."""

    RELAY = "https://apex-taiga-relay.example.workers.dev"
    # Only api.taiga.io (the Azure-blocked host) is relayed; private instances bypass.
    CLOUD_URL = "https://api.taiga.io/api/v1"
    PRIVATE_URL = "https://arise.trycloudflare.com/api/v1"
    AUTH = "Bearer mytoken"

    def test_catch_all_cloud_routed_through_relay(self, client, monkeypatch):
        monkeypatch.setenv("TAIGA_EGRESS_RELAY", self.RELAY + "/")  # trailing slash trimmed
        monkeypatch.setenv("TAIGA_EGRESS_RELAY_SECRET", "s3cr3t")
        upstream = _mock_upstream(200, [{"id": 1}])
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = client.get(
                "/api/pm/taiga/epics?project=2",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": self.CLOUD_URL},
            )
        assert resp.status_code == 200
        kw = mock_http.request.call_args.kwargs
        assert kw["url"] == self.RELAY  # sent to the Worker root, not Taiga
        assert kw["headers"]["X-Relay-Target"] == f"{self.CLOUD_URL}/epics?project=2"
        assert kw["headers"]["X-Relay-Secret"] == "s3cr3t"
        assert kw["headers"]["Authorization"] == self.AUTH  # forwarded through

    def test_auth_cloud_routed_through_relay(self, client, monkeypatch):
        monkeypatch.setenv("TAIGA_EGRESS_RELAY", self.RELAY)
        monkeypatch.setenv("TAIGA_EGRESS_RELAY_SECRET", "s3cr3t")
        upstream = _mock_auth_upstream(200, {"auth_token": "tok"})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            # Auth sends the bare origin (frontend strips /api/v1); handler appends it.
            resp = client.post(
                "/api/pm/taiga/auth",
                headers={"X-Taiga-Url": "https://api.taiga.io"},
                json={"username": "u", "password": "p", "type": "normal"},
            )
        assert resp.status_code == 200
        kw = mock_http.request.call_args.kwargs
        assert kw["url"] == self.RELAY
        assert kw["headers"]["X-Relay-Target"] == "https://api.taiga.io/api/v1/auth"
        assert kw["headers"]["X-Relay-Secret"] == "s3cr3t"

    def test_private_instance_bypasses_relay(self, client, monkeypatch):
        # Private/self-hosted Taiga IS reachable from Azure — must NOT go through
        # the relay (the Worker allow-lists api.taiga.io only and would 403 it).
        monkeypatch.setenv("TAIGA_EGRESS_RELAY", self.RELAY)
        monkeypatch.setenv("TAIGA_EGRESS_RELAY_SECRET", "s3cr3t")
        upstream = _mock_upstream(200, [{"id": 1}])
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = client.get(
                "/api/pm/taiga/epics",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": self.PRIVATE_URL},
            )
        assert resp.status_code == 200
        kw = mock_http.request.call_args.kwargs
        assert kw["url"].startswith(self.PRIVATE_URL)  # direct, not the relay
        assert "X-Relay-Target" not in kw["headers"]

    def test_auth_private_instance_bypasses_relay(self, client, monkeypatch):
        monkeypatch.setenv("TAIGA_EGRESS_RELAY", self.RELAY)
        monkeypatch.setenv("TAIGA_EGRESS_RELAY_SECRET", "s3cr3t")
        upstream = _mock_auth_upstream(200, {"auth_token": "tok"})
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = client.post(
                "/api/pm/taiga/auth",
                headers={"X-Taiga-Url": "https://arise.trycloudflare.com"},
                json={"username": "u", "password": "p", "type": "normal"},
            )
        assert resp.status_code == 200
        kw = mock_http.request.call_args.kwargs
        assert kw["url"] == "https://arise.trycloudflare.com/api/v1/auth"  # direct
        assert "X-Relay-Target" not in kw["headers"]

    def test_no_relay_when_unset_goes_direct(self, client, monkeypatch):
        monkeypatch.delenv("TAIGA_EGRESS_RELAY", raising=False)
        upstream = _mock_upstream(200, [{"id": 1}])
        patcher, mock_http = _patch_client(upstream)
        with patcher:
            resp = client.get(
                "/api/pm/taiga/epics",
                headers={"Authorization": self.AUTH, "X-Taiga-Url": self.CLOUD_URL},
            )
        assert resp.status_code == 200
        kw = mock_http.request.call_args.kwargs
        assert kw["url"].startswith(self.CLOUD_URL)  # direct to Taiga
        assert "X-Relay-Target" not in kw["headers"]
