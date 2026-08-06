"""Tests for PM-anchored credential validation in deps.py (audit C2).

All tests are marked real_auth so the global _bypass_pm_auth fixture does not
stub out the functions under test. Upstream PM responses are mocked.
"""

from collections import OrderedDict
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException

from backend.app.api import deps

pytestmark = pytest.mark.real_auth


@pytest.fixture(autouse=True)
def _fresh_caches(monkeypatch):
    # OrderedDict to match the production caches (LRU eviction, audit M8).
    monkeypatch.setattr(deps, "_token_cache", OrderedDict())
    monkeypatch.setattr(deps, "_project_cache", OrderedDict())
    monkeypatch.setattr(deps, "_account_id_cache", OrderedDict())


@pytest.fixture(autouse=True)
def _deterministic_dns():
    # The unified egress now IP-pins the direct path (audit H2). Make DNS a
    # no-op so pinning leaves the URL as the hostname and these tests stay
    # hermetic; the pin mechanics themselves are covered in test_ssrf_pinning.
    import socket as _socket
    from backend.app.api import ssrf
    with patch.object(
        ssrf, "socket",
        MagicMock(getaddrinfo=MagicMock(side_effect=OSError), AF_INET=_socket.AF_INET),
    ):
        yield


def _mock_pm(status_code: int):
    """Patch the verify client to return status_code for every GET.

    get_auth_context now also calls resolve_account_id (real_auth tests only —
    the global bypass fixture stubs it everywhere else), which parses the same
    response body for a Taiga `id`; a deterministic body keeps that resolution
    (and its own dial) predictable here too.
    """
    resp = MagicMock()
    resp.is_success = 200 <= status_code < 300
    resp.status_code = status_code
    resp.json.return_value = {"id": 1, "username": "testuser"}
    client = MagicMock()
    client.request = MagicMock(return_value=resp)
    return patch.object(deps, "_get_verify_client", return_value=client), client


def _taiga_config():
    return patch("src.context_manager.load_config", return_value={"pm_tool": "taiga"})


# ---------------------------------------------------------------------------
# Token validation
# ---------------------------------------------------------------------------

def test_valid_token_accepted_and_identity_url_correct():
    pm, client = _mock_pm(200)
    with pm, _taiga_config():
        ctx = deps.get_auth_context("Bearer goodtoken")
    assert ctx.pm_token == "goodtoken"
    url = client.request.call_args.args[1]
    assert url.endswith("/api/v1/users/me")
    assert client.request.call_args.kwargs["headers"]["Authorization"] == "Bearer goodtoken"


def test_rejected_token_raises_401():
    pm, _ = _mock_pm(401)
    with pm, _taiga_config():
        with pytest.raises(HTTPException) as exc:
            deps.get_auth_context("Bearer badtoken")
    assert exc.value.status_code == 401


def test_credential_check_routes_through_egress_relay(monkeypatch):
    # Regression: api.taiga.io is firewall-DROPped from Azure egress, so the
    # credential dial must go through the relay like the proxy does. Without it
    # validation fails with [Errno 101] Network is unreachable (503) whenever the
    # token cache is cold, even though the proxy stays up.
    monkeypatch.setenv("TAIGA_EGRESS_RELAY", "https://relay.example.workers.dev")
    monkeypatch.setenv("TAIGA_EGRESS_RELAY_SECRET", "shh")
    pm, client = _mock_pm(200)
    with pm, _taiga_config():
        deps.get_auth_context("Bearer goodtoken")
    url = client.request.call_args.args[1]
    headers = client.request.call_args.kwargs["headers"]
    assert url == "https://relay.example.workers.dev"
    assert headers["X-Relay-Target"].endswith("/api/v1/users/me")
    assert headers["X-Relay-Secret"] == "shh"
    assert headers["Authorization"] == "Bearer goodtoken"


def test_unified_egress_pins_direct_path():
    # The credential check now shares the proxy's IP-pinning (audit H2 unified):
    # the direct path connects to the resolved IP with the hostname in Host + SNI.
    from backend.app.api import ssrf
    pm, client = _mock_pm(200)
    with pm, _taiga_config(), patch.object(
        ssrf.socket, "getaddrinfo",
        new=lambda host, *a, **k: [(2, 1, 6, "", ("203.0.113.10", 0))],
    ):
        deps.get_auth_context("Bearer goodtoken")
    url = client.request.call_args.args[1]
    headers = client.request.call_args.kwargs["headers"]
    assert "203.0.113.10" in url
    assert headers["Host"] == "api.taiga.io"
    assert client.request.call_args.kwargs["extensions"] == {"sni_hostname": "api.taiga.io"}


def test_credential_check_bypasses_relay_for_private_anchor(monkeypatch):
    # Self-hosted / tunnel instances ARE reachable from Azure — they must NOT be
    # rewritten to the relay (relay ALLOWED_HOSTS would reject them anyway).
    monkeypatch.setenv("TAIGA_EGRESS_RELAY", "https://relay.example.workers.dev")
    monkeypatch.setenv("TAIGA_API_URL", "https://my-tunnel.trycloudflare.com")
    pm, client = _mock_pm(200)
    with pm, _taiga_config():
        deps.get_auth_context("Bearer goodtoken")
    url = client.request.call_args.args[1]
    assert url.startswith("https://my-tunnel.trycloudflare.com")
    assert "X-Relay-Target" not in client.request.call_args.kwargs["headers"]


def test_pm_unreachable_raises_503():
    client = MagicMock()
    client.request = MagicMock(side_effect=httpx.ConnectError("refused"))
    with patch.object(deps, "_get_verify_client", return_value=client), _taiga_config():
        with pytest.raises(HTTPException) as exc:
            deps.get_auth_context("Bearer sometoken")
    assert exc.value.status_code == 503


def test_successful_validation_is_cached():
    pm, client = _mock_pm(200)
    with pm, _taiga_config():
        deps.get_auth_context("Bearer goodtoken")
        deps.get_auth_context("Bearer goodtoken")
    # 1 identity dial (_verify_pm_token) + 1 identity dial (resolve_account_id,
    # its own independent cache) on the first call; both cached on the second.
    assert client.request.call_count == 2


def test_failed_validation_is_negatively_cached():
    pm, client = _mock_pm(401)
    with pm, _taiga_config():
        for _ in range(3):
            with pytest.raises(HTTPException):
                deps.get_auth_context("Bearer badtoken")
    assert client.request.call_count == 1


# ---------------------------------------------------------------------------
# Project authorization
# ---------------------------------------------------------------------------

def test_project_access_granted_for_readable_project():
    pm, client = _mock_pm(200)
    with pm, _taiga_config():
        ctx = deps.get_request_context("Bearer goodtoken", 42, None)
    assert ctx.project_id == 42
    project_url = client.request.call_args_list[-1].args[1]
    assert project_url.endswith("/api/v1/projects/42")


def test_project_access_denied_raises_403():
    """Token valid on the PM, but the project is not visible to it —
    the cross-tenant case the audit flagged."""
    identity_resp = MagicMock(is_success=True, status_code=200)
    identity_resp.json.return_value = {"id": 1}
    project_resp = MagicMock(is_success=False, status_code=404)
    client = MagicMock()
    # _verify_pm_token's identity dial, resolve_account_id's identity dial, then
    # the project-access dial.
    client.request = MagicMock(side_effect=[identity_resp, identity_resp, project_resp])
    with patch.object(deps, "_get_verify_client", return_value=client), _taiga_config():
        with pytest.raises(HTTPException) as exc:
            deps.get_request_context("Bearer goodtoken", 42, None)
    assert exc.value.status_code == 403


def test_project_access_is_cached_per_token_and_project():
    pm, client = _mock_pm(200)
    with pm, _taiga_config():
        deps.get_request_context("Bearer goodtoken", 42, None)
        deps.get_request_context("Bearer goodtoken", 42, None)
    # 1 identity check (_verify_pm_token) + 1 identity check (resolve_account_id)
    # + 1 project check, all cached on the second call.
    assert client.request.call_count == 3


def test_different_project_revalidates():
    pm, client = _mock_pm(200)
    with pm, _taiga_config():
        deps.get_request_context("Bearer goodtoken", 42, None)
        deps.get_request_context("Bearer goodtoken", 43, None)
    # Both identity checks cached across calls (same token); projects 42 and 43
    # each dial once since they're not cached yet.
    assert client.request.call_count == 4


# ---------------------------------------------------------------------------
# Header parsing still enforced before any network call
# ---------------------------------------------------------------------------

def test_malformed_header_rejected_without_pm_call():
    pm, client = _mock_pm(200)
    with pm, _taiga_config():
        with pytest.raises(HTTPException) as exc:
            deps.get_auth_context("Basic dXNlcjpwYXNz")
    assert exc.value.status_code == 401
    assert client.request.call_count == 0


# ---------------------------------------------------------------------------
# Taiga identity anchor resolution (private/self-hosted instances)
# ---------------------------------------------------------------------------

def _no_dns():
    """Make the SSRF guard's DNS resolution deterministic in tests."""
    import socket as _socket
    from backend.app.api import ssrf
    return patch.object(ssrf, "socket", MagicMock(getaddrinfo=MagicMock(side_effect=OSError), AF_INET=_socket.AF_INET))


def test_env_taiga_api_url_anchors_identity(monkeypatch):
    monkeypatch.setenv("TAIGA_API_URL", "https://my-tunnel.trycloudflare.com")
    pm, client = _mock_pm(200)
    with pm, _taiga_config(), _no_dns():
        deps.get_auth_context("Bearer privatetoken")
    url = client.request.call_args.args[1]
    assert url == "https://my-tunnel.trycloudflare.com/api/v1/users/me"


def test_config_taiga_url_is_not_used_as_anchor(monkeypatch):
    # Workspace config taiga_url is user-writable and goes stale across sessions,
    # so it is NOT a validation anchor. With no env and no request header, the
    # anchor falls through to Taiga Cloud (not the config value).
    monkeypatch.delenv("TAIGA_API_URL", raising=False)
    config = {"pm_tool": "taiga", "taiga_url": "https://tree.taiga.example.org"}
    pm, client = _mock_pm(200)
    with pm, patch("src.context_manager.load_config", return_value=config), _no_dns():
        deps.get_auth_context("Bearer sometoken")
    url = client.request.call_args.args[1]
    assert url == "https://api.taiga.io/api/v1/users/me"


def test_header_anchor_used_when_no_server_anchor(monkeypatch):
    # Single-user/dev: nothing pinned (no env, config without taiga_url) → the
    # per-request X-Taiga-Url anchors validation (codex's private-instance flow).
    monkeypatch.delenv("TAIGA_API_URL", raising=False)
    pm, client = _mock_pm(200)
    with pm, _taiga_config(), _no_dns():
        deps.get_auth_context("Bearer privatetoken", "https://private.example.org")
    url = client.request.call_args.args[1]
    assert url == "https://private.example.org/api/v1/users/me"


def test_server_env_anchor_overrides_request_header(monkeypatch):
    # Multi-user security: a pinned server anchor (env) must beat the caller's
    # X-Taiga-Url so a rogue instance can't be used to rubber-stamp credentials.
    monkeypatch.setenv("TAIGA_API_URL", "https://api.taiga.io")
    pm, client = _mock_pm(200)
    with pm, _taiga_config(), _no_dns():
        deps.get_auth_context("Bearer tok", "https://rogue.example.org")
    url = client.request.call_args.args[1]
    assert url == "https://api.taiga.io/api/v1/users/me"


def test_request_header_beats_stale_config(monkeypatch):
    # The deployment bug: a stale config taiga_url must NOT override the current
    # request's X-Taiga-Url, or a fresh private-instance token validates against
    # the old instance and 401s. Header wins; config is ignored.
    monkeypatch.delenv("TAIGA_API_URL", raising=False)
    config = {"pm_tool": "taiga", "taiga_url": "https://old-tunnel.example.org"}
    pm, client = _mock_pm(200)
    with pm, patch("src.context_manager.load_config", return_value=config), _no_dns():
        deps.get_auth_context("Bearer tok", "https://current-tunnel.example.org")
    url = client.request.call_args.args[1]
    assert url == "https://current-tunnel.example.org/api/v1/users/me"


def test_header_taiga_url_overrides_stale_pm_tool_config(monkeypatch):
    # A present X-Taiga-Url is an unambiguous Taiga request even if shared
    # config's pm_tool is stale/unrecognised — it must still anchor to Taiga.
    monkeypatch.delenv("TAIGA_API_URL", raising=False)
    config = {"pm_tool": "other", "taiga_url": "https://stale.example.org"}
    pm, client = _mock_pm(200)
    with pm, patch("src.context_manager.load_config", return_value=config), _no_dns():
        deps.get_auth_context("Bearer tok", "https://taiga.example.org")
    url = client.request.call_args.args[1]
    assert url == "https://taiga.example.org/api/v1/users/me"


def test_env_wins_over_config(monkeypatch):
    monkeypatch.setenv("TAIGA_API_URL", "https://env-tunnel.trycloudflare.com")
    config = {"pm_tool": "taiga", "taiga_url": "https://config.example.org"}
    pm, client = _mock_pm(200)
    with pm, patch("src.context_manager.load_config", return_value=config), _no_dns():
        deps.get_auth_context("Bearer sometoken")
    assert client.request.call_args.args[1].startswith("https://env-tunnel.trycloudflare.com")


def test_token_cache_is_scoped_to_identity_anchor(monkeypatch):
    monkeypatch.delenv("TAIGA_API_URL", raising=False)
    pm, client = _mock_pm(200)
    with pm, _taiga_config(), _no_dns():
        deps.get_auth_context("Bearer same-token", "https://one.example.org")
        deps.get_auth_context("Bearer same-token", "https://two.example.org")
    # Each anchor is dialled twice on first sight: once by _verify_pm_token
    # (bool cache) and once by resolve_account_id (its own, separate cache) —
    # see resolve_account_id's docstring for why that cache is intentionally
    # independent. The invariant under test is still that neither anchor's
    # dials leak into/reuse the other's cache.
    urls = [call.args[1] for call in client.request.call_args_list]
    assert urls == [
        "https://one.example.org/api/v1/users/me",
        "https://one.example.org/api/v1/users/me",
        "https://two.example.org/api/v1/users/me",
        "https://two.example.org/api/v1/users/me",
    ]


def test_default_anchor_is_taiga_cloud(monkeypatch):
    monkeypatch.delenv("TAIGA_API_URL", raising=False)
    pm, client = _mock_pm(200)
    with pm, _taiga_config(), _no_dns():
        deps.get_auth_context("Bearer cloudtoken")
    assert client.request.call_args.args[1] == "https://api.taiga.io/api/v1/users/me"


def test_private_anchor_url_rejected(monkeypatch):
    # A private-address anchor (e.g. stale config pointing at localhost) must
    # not be dialled — same SSRF rules as the proxy.
    monkeypatch.setenv("TAIGA_API_URL", "http://localhost:9000")
    with _taiga_config():
        with pytest.raises(HTTPException) as exc:
            deps.get_auth_context("Bearer sometoken")
    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# resolve_account_id / _pm_get_json (bring-your-own AI key account resolution)
# ---------------------------------------------------------------------------

def _mock_pm_json(status_code: int, body: dict | None = None):
    resp = MagicMock()
    resp.is_success = 200 <= status_code < 300
    resp.status_code = status_code
    resp.json.return_value = body if body is not None else {}
    client = MagicMock()
    client.request = MagicMock(return_value=resp)
    return patch.object(deps, "_get_verify_client", return_value=client), client


class TestResolveAccountId:
    def test_taiga_uses_numeric_id(self, monkeypatch):
        monkeypatch.delenv("TAIGA_API_URL", raising=False)
        pm, client = _mock_pm_json(200, {"id": 42, "username": "alice"})
        with pm, _taiga_config(), _no_dns():
            account_id = deps.resolve_account_id("Bearer tok")
        assert account_id == "42"

    def test_rejected_credentials_yield_empty_string(self, monkeypatch):
        monkeypatch.delenv("TAIGA_API_URL", raising=False)
        pm, client = _mock_pm_json(401)
        with pm, _taiga_config(), _no_dns():
            assert deps.resolve_account_id("Bearer badtoken") == ""

    def test_network_error_yields_empty_string_not_raise(self, monkeypatch):
        monkeypatch.delenv("TAIGA_API_URL", raising=False)
        client = MagicMock()
        client.request = MagicMock(side_effect=httpx.ConnectError("boom"))
        with patch.object(deps, "_get_verify_client", return_value=client), _taiga_config(), _no_dns():
            assert deps.resolve_account_id("Bearer sometoken") == ""

    def test_missing_id_field_yields_empty_string(self, monkeypatch):
        monkeypatch.delenv("TAIGA_API_URL", raising=False)
        pm, client = _mock_pm_json(200, {"username": "alice"})  # no "id" key
        with pm, _taiga_config(), _no_dns():
            assert deps.resolve_account_id("Bearer tok") == ""

    def test_result_is_cached_across_calls(self, monkeypatch):
        monkeypatch.delenv("TAIGA_API_URL", raising=False)
        pm, client = _mock_pm_json(200, {"id": 7})
        with pm, _taiga_config(), _no_dns():
            first = deps.resolve_account_id("Bearer tok")
            second = deps.resolve_account_id("Bearer tok")
        assert first == second == "7"
        assert client.request.call_count == 1  # second call served from cache, no dial

    def test_failed_lookup_is_not_cached(self, monkeypatch):
        # A transient failure must not stick for the full TTL — retried next call.
        monkeypatch.delenv("TAIGA_API_URL", raising=False)
        pm, client = _mock_pm_json(401)
        with pm, _taiga_config(), _no_dns():
            deps.resolve_account_id("Bearer tok")
            deps.resolve_account_id("Bearer tok")
        assert client.request.call_count == 2

    def test_uses_redis_when_configured(self, monkeypatch):
        import fakeredis
        from src import distributed

        fake = fakeredis.FakeRedis(decode_responses=True)
        monkeypatch.setattr(distributed, "redis_client", lambda: fake)
        monkeypatch.delenv("TAIGA_API_URL", raising=False)
        pm, client = _mock_pm_json(200, {"id": 99})
        with pm, _taiga_config(), _no_dns():
            first = deps.resolve_account_id("Bearer tok")
            second = deps.resolve_account_id("Bearer tok")
        assert first == second == "99"
        assert client.request.call_count == 1  # second call served from Redis


class TestLoadPersonalAiKeys:
    def test_populates_context_var_from_store(self, monkeypatch, tmp_path):
        from src import ai_key_store, ai_engine
        from src.storage import StoragePath

        monkeypatch.setattr(ai_key_store, "_BASE_CONTEXTSPEC", StoragePath(str(tmp_path / "contextspec")))
        monkeypatch.setenv("AI_KEY_ENCRYPTION_SECRET", "test-secret")
        monkeypatch.setattr(deps, "anchor_instance_id", lambda *a, **k: "api_taiga_io")
        ai_key_store.save_key("api_taiga_io", "42", "openai", "sk-personal-key")

        deps._load_personal_ai_keys("42", "")
        assert ai_engine._user_api_key("openai") == "sk-personal-key"

    def test_empty_account_id_clears_context_var(self, monkeypatch):
        from src import ai_engine

        ai_engine.set_user_api_keys({"openai": "sk-stale-from-a-previous-request"})
        deps._load_personal_ai_keys("", "")
        assert ai_engine._user_api_key("openai") == ""

    def test_store_lookup_failure_is_swallowed(self, monkeypatch):
        # A broken key store must degrade to "no personal key", not break the request.
        from src import ai_engine, ai_key_store

        monkeypatch.setattr(deps, "anchor_instance_id", lambda *a, **k: "api_taiga_io")
        monkeypatch.setattr(ai_key_store, "load_keys", MagicMock(side_effect=RuntimeError("disk on fire")))
        ai_engine.set_user_api_keys({"openai": "sk-stale-from-a-previous-request"})
        deps._load_personal_ai_keys("42", "")  # must not raise
        assert ai_engine._user_api_key("openai") == ""


# ---------------------------------------------------------------------------
# Plane identity anchor — get_auth_context only (get_request_context stays
# Taiga-only until a Plane project adapter exists, see plane_integration_plan
# memory). A present X-Plane-Url anchors the request as Plane instead of Taiga.
# ---------------------------------------------------------------------------

def _mock_plane_pm(status_code: int):
    resp = MagicMock()
    resp.is_success = 200 <= status_code < 300
    resp.status_code = status_code
    resp.json.return_value = {"id": "11111111-1111-1111-1111-111111111111", "display_name": "testuser"}
    client = MagicMock()
    client.request = MagicMock(return_value=resp)
    return patch.object(deps, "_get_verify_client", return_value=client), client


class TestPlaneIdentityAnchor:
    PLANE_URL = "https://plane.example.test"

    def test_valid_token_accepted_and_identity_url_correct(self):
        pm, client = _mock_plane_pm(200)
        with pm:
            ctx = deps.get_auth_context("Bearer goodtoken", "", self.PLANE_URL)
        assert ctx.pm_token == "goodtoken"
        url = client.request.call_args.args[1]
        assert url.endswith("/api/v1/users/me/")
        # Plane's auth header shape: X-Api-Key with no scheme prefix, not
        # Authorization: Bearer — this is the whole point of _pm_auth_headers.
        headers = client.request.call_args.kwargs["headers"]
        assert headers["X-Api-Key"] == "goodtoken"
        assert "Authorization" not in headers

    def test_rejected_token_raises_401(self):
        pm, _ = _mock_plane_pm(401)
        with pm:
            with pytest.raises(HTTPException) as exc:
                deps.get_auth_context("Bearer badtoken", "", self.PLANE_URL)
        assert exc.value.status_code == 401

    def test_pm_unreachable_raises_503(self):
        client = MagicMock()
        client.request = MagicMock(side_effect=httpx.ConnectError("refused"))
        with patch.object(deps, "_get_verify_client", return_value=client):
            with pytest.raises(HTTPException) as exc:
                deps.get_auth_context("Bearer sometoken", "", self.PLANE_URL)
        assert exc.value.status_code == 503

    def test_account_id_resolved_from_plane_uuid(self):
        pm, _ = _mock_plane_pm(200)
        with pm:
            ctx = deps.get_auth_context("Bearer goodtoken", "", self.PLANE_URL)
        assert ctx.account_id == "11111111-1111-1111-1111-111111111111"

    def test_taiga_and_plane_tokens_cache_independently(self):
        """Same token string, different anchor — must not share a cache entry
        (identity_url differs, so the (token_hash, identity_url) cache key
        already separates them, but this pins the behaviour)."""
        taiga_pm, taiga_client = _mock_pm(200)
        plane_pm, plane_client = _mock_plane_pm(200)
        with taiga_pm, _taiga_config():
            deps.get_auth_context("Bearer sametoken")
        with plane_pm:
            deps.get_auth_context("Bearer sametoken", "", self.PLANE_URL)
        assert taiga_client.request.call_count == 2  # identity + account-id dial
        assert plane_client.request.call_count == 2

    def test_ssrf_guard_applies_to_plane_anchor_too(self):
        with pytest.raises(HTTPException) as exc:
            deps.get_auth_context("Bearer goodtoken", "", "https://192.168.1.1")
        assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# Project-id normalisation (phase 4a — Plane's UUID project ids alongside
# Taiga's numeric ones)
# ---------------------------------------------------------------------------

class TestParseProjectId:
    def test_taiga_numeric_string_becomes_int(self):
        assert deps._parse_project_id("42") == 42
        assert isinstance(deps._parse_project_id("42"), int)

    def test_raw_int_passes_through(self):
        assert deps._parse_project_id(42) == 42

    def test_uuid_string_stays_a_string(self):
        uuid = "f722d8f5-57a4-4c98-8651-f7e89970c359"
        assert deps._parse_project_id(uuid) == uuid
        assert isinstance(deps._parse_project_id(uuid), str)

    def test_none_and_empty_and_whitespace_return_none(self):
        assert deps._parse_project_id(None) is None
        assert deps._parse_project_id("") is None
        assert deps._parse_project_id("   ") is None

    def test_zero_and_negative_int_return_none(self):
        assert deps._parse_project_id(0) is None
        assert deps._parse_project_id(-1) is None
        assert deps._parse_project_id("0") is None
        assert deps._parse_project_id("-1") is None

    # SECURITY REGRESSION (2026-08-06): a crafted non-UUID X-Project-Id used
    # to sail through unchanged on the assumption the PM access check would
    # reject it — it didn't (httpx collapses ".." dot-segments building the
    # outbound request, redirecting the check onto an unrelated always-200
    # endpoint), and the unvalidated string then reached a filesystem path
    # join with zero sanitization. Every one of these must now be rejected
    # right here, before it can reach a URL template or a path join.
    @pytest.mark.parametrize("payload", [
        "../users/me",
        "../../etc/passwd",
        "..",
        "a/b",
        "a\\b",
        "foo/../bar",
        "not-a-uuid-at-all",
        "f722d8f5-57a4-4c98-8651-f7e89970c35",   # one char short of a real UUID
        "f722d8f5-57a4-4c98-8651-f7e89970c3599",  # one char long
        "f722d8f5_57a4_4c98_8651_f7e89970c359",  # underscores, not hyphens
    ])
    def test_rejects_non_uuid_non_numeric_strings(self, payload):
        assert deps._parse_project_id(payload) is None

    def test_accepts_a_real_uuid_shape(self):
        uuid = "f722d8f5-57a4-4c98-8651-f7e89970c359"
        assert deps._parse_project_id(uuid) == uuid

    def test_accepts_uppercase_uuid_shape(self):
        # Real Plane UUIDs are lowercase, but the regex itself should not be
        # needlessly case-sensitive — uppercase hex is still a valid UUID.
        uuid = "F722D8F5-57A4-4C98-8651-F7E89970C359"
        assert deps._parse_project_id(uuid) == uuid


class TestValidatePlaneWorkspaceSlug:
    @pytest.mark.parametrize("slug", ["../users/me", "a/b", "a\\b", "..", "", "foo bar"])
    def test_rejects_malformed_slugs(self, slug):
        with pytest.raises(HTTPException) as exc:
            deps._validate_plane_workspace_slug(slug)
        assert exc.value.status_code == 400

    @pytest.mark.parametrize("slug", ["my-team", "apex-bolt", "team_1", "a"])
    def test_accepts_real_slug_shapes(self, slug):
        assert deps._validate_plane_workspace_slug(slug) == slug


# ---------------------------------------------------------------------------
# Project-scoped access check on a Plane anchor (phase 4a)
# ---------------------------------------------------------------------------

class TestPlaneProjectAccess:
    PLANE_URL = "https://plane.example.test"
    UUID = "f722d8f5-57a4-4c98-8651-f7e89970c359"

    def test_builds_the_workspace_scoped_project_url_and_accepts(self):
        pm, client = _mock_plane_pm(200)
        with pm:
            deps._verify_project_access("goodtoken", self.UUID, "", self.PLANE_URL, "my-team")
        url = client.request.call_args.args[1]
        assert url == f"{self.PLANE_URL}/api/v1/workspaces/my-team/projects/{self.UUID}/"
        assert client.request.call_args.kwargs["headers"]["X-Api-Key"] == "goodtoken"

    def test_rejected_by_pm_raises_403(self):
        pm, _ = _mock_plane_pm(403)
        with pm:
            with pytest.raises(HTTPException) as exc:
                deps._verify_project_access("badtoken", self.UUID, "", self.PLANE_URL, "my-team")
        assert exc.value.status_code == 403

    def test_missing_workspace_slug_raises_400_before_dialing_anything(self):
        client = MagicMock()
        with patch.object(deps, "_get_verify_client", return_value=client):
            with pytest.raises(HTTPException) as exc:
                deps._verify_project_access("goodtoken", self.UUID, "", self.PLANE_URL, "")
        assert exc.value.status_code == 400
        client.request.assert_not_called()

    def test_get_request_context_end_to_end_with_a_plane_uuid_project_id(self):
        """Full get_request_context flow (real_auth — not bypassed): a Plane
        anchor, a UUID project id, and a workspace slug all threaded through
        correctly to land on RequestContext.project_id as the real UUID."""
        pm, client = _mock_plane_pm(200)
        with pm, patch("src.context_manager.instance_key", return_value="plane_example_test"):
            ctx = deps.get_request_context(
                authorization="Bearer goodtoken",
                x_taiga_url="",
                project_id_new=self.UUID,
                project_id_legacy=None,
                x_plane_url=self.PLANE_URL,
                x_plane_workspace="my-team",
            )
        assert ctx.project_id == self.UUID
        assert isinstance(ctx.project_id, str)
        assert ctx.instance_id == "plane_example_test"
        # Two dials on the (mocked) client: identity check + project check —
        # account-id resolution reuses the identity dial's cached result.
        urls = [c.args[1] for c in client.request.call_args_list]
        assert any(u.endswith("/api/v1/users/me/") for u in urls)
        assert any(u == f"{self.PLANE_URL}/api/v1/workspaces/my-team/projects/{self.UUID}/" for u in urls)

    def test_get_request_context_rejects_missing_workspace_for_a_plane_project(self):
        pm, _ = _mock_plane_pm(200)
        with pm:
            with pytest.raises(HTTPException) as exc:
                deps.get_request_context(
                    authorization="Bearer goodtoken",
                    x_taiga_url="",
                    project_id_new=self.UUID,
                    project_id_legacy=None,
                    x_plane_url=self.PLANE_URL,
                    x_plane_workspace="",
                )
        assert exc.value.status_code == 400

    # SECURITY REGRESSION (2026-08-06) — the actual exploit chain: a crafted
    # X-Project-Id used to reach _verify_project_access unrejected, whose PM
    # dial does not itself validate shape (it's an authorization check, not
    # a validator) — must now be rejected by _parse_project_id before
    # get_request_context ever calls _verify_project_access at all. The PM
    # mock below would happily return 200 for ANY dialed URL if this were
    # broken (proving the old code's implicit trust in "the PM will reject
    # it" was the actual bug), so a 400 here — not a 403 from a real (if
    # misdirected) PM dial — is the thing that proves the fix.
    def test_get_request_context_rejects_a_path_traversal_project_id(self):
        pm, client = _mock_plane_pm(200)  # would accept ANY URL — the point
        with pm:
            with pytest.raises(HTTPException) as exc:
                deps.get_request_context(
                    authorization="Bearer goodtoken",
                    x_taiga_url="",
                    project_id_new="../users/me",
                    project_id_legacy=None,
                    x_plane_url=self.PLANE_URL,
                    x_plane_workspace="my-team",
                )
        assert exc.value.status_code == 400
        # The PM must never even have been dialed for the project check —
        # rejection happens before _verify_project_access runs at all.
        client.request.assert_not_called()

    def test_verify_project_access_also_rejects_a_path_traversal_id_directly(self):
        # Defense-in-depth: even if some future caller reached
        # _verify_project_access directly with a bad id (bypassing
        # get_request_context's own _parse_project_id gate), .format() on
        # the URL template itself doesn't validate — this pins that
        # _parse_project_id is the ONLY thing standing between a bad id and
        # a dial, by showing _verify_project_access alone does NOT reject it
        # (i.e. the gate must stay upstream, not be assumed here too).
        pm, client = _mock_plane_pm(200)
        with pm:
            deps._verify_project_access("goodtoken", "../users/me", "", self.PLANE_URL, "my-team")
        # No exception — confirms the traversal payload reaches the PM dial
        # unless the caller (get_request_context) already rejected it.
        url = client.request.call_args.args[1]
        assert "../users/me" in url
