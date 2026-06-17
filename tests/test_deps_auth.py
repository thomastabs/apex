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


def _mock_pm(status_code: int):
    """Patch the verify client to return status_code for every GET."""
    resp = MagicMock()
    resp.is_success = 200 <= status_code < 300
    resp.status_code = status_code
    client = MagicMock()
    client.get = MagicMock(return_value=resp)
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
    url = client.get.call_args.args[0]
    assert url.endswith("/api/v1/users/me")
    assert client.get.call_args.kwargs["headers"]["Authorization"] == "Bearer goodtoken"


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
    url = client.get.call_args.args[0]
    headers = client.get.call_args.kwargs["headers"]
    assert url == "https://relay.example.workers.dev"
    assert headers["X-Relay-Target"].endswith("/api/v1/users/me")
    assert headers["X-Relay-Secret"] == "shh"
    assert headers["Authorization"] == "Bearer goodtoken"


def test_credential_check_bypasses_relay_for_private_anchor(monkeypatch):
    # Self-hosted / tunnel instances ARE reachable from Azure — they must NOT be
    # rewritten to the relay (relay ALLOWED_HOSTS would reject them anyway).
    monkeypatch.setenv("TAIGA_EGRESS_RELAY", "https://relay.example.workers.dev")
    monkeypatch.setenv("TAIGA_API_URL", "https://my-tunnel.trycloudflare.com")
    pm, client = _mock_pm(200)
    with pm, _taiga_config():
        deps.get_auth_context("Bearer goodtoken")
    url = client.get.call_args.args[0]
    assert url.startswith("https://my-tunnel.trycloudflare.com")
    assert "X-Relay-Target" not in client.get.call_args.kwargs["headers"]


def test_pm_unreachable_raises_503():
    client = MagicMock()
    client.get = MagicMock(side_effect=httpx.ConnectError("refused"))
    with patch.object(deps, "_get_verify_client", return_value=client), _taiga_config():
        with pytest.raises(HTTPException) as exc:
            deps.get_auth_context("Bearer sometoken")
    assert exc.value.status_code == 503


def test_successful_validation_is_cached():
    pm, client = _mock_pm(200)
    with pm, _taiga_config():
        deps.get_auth_context("Bearer goodtoken")
        deps.get_auth_context("Bearer goodtoken")
    assert client.get.call_count == 1


def test_failed_validation_is_negatively_cached():
    pm, client = _mock_pm(401)
    with pm, _taiga_config():
        for _ in range(3):
            with pytest.raises(HTTPException):
                deps.get_auth_context("Bearer badtoken")
    assert client.get.call_count == 1


def test_jira_workspace_uses_basic_scheme_and_myself():
    pm, client = _mock_pm(200)
    config = {"pm_tool": "jira", "jira_base_url": "https://example.atlassian.net"}
    with pm, patch("src.context_manager.load_config", return_value=config):
        deps.get_auth_context("Bearer base64basiccred")
    url = client.get.call_args.args[0]
    assert url == "https://example.atlassian.net/rest/api/3/myself"
    assert client.get.call_args.kwargs["headers"]["Authorization"] == "Basic base64basiccred"


def test_jira_workspace_without_base_url_raises_503():
    with patch("src.context_manager.load_config", return_value={"pm_tool": "jira"}):
        with pytest.raises(HTTPException) as exc:
            deps.get_auth_context("Bearer sometoken")
    assert exc.value.status_code == 503


# ---------------------------------------------------------------------------
# Project authorization
# ---------------------------------------------------------------------------

def test_project_access_granted_for_readable_project():
    pm, client = _mock_pm(200)
    with pm, _taiga_config():
        ctx = deps.get_request_context("Bearer goodtoken", 42, None)
    assert ctx.project_id == 42
    project_url = client.get.call_args_list[-1].args[0]
    assert project_url.endswith("/api/v1/projects/42")


def test_project_access_denied_raises_403():
    """Token valid on the PM, but the project is not visible to it —
    the cross-tenant case the audit flagged."""
    identity_resp = MagicMock(is_success=True, status_code=200)
    project_resp = MagicMock(is_success=False, status_code=404)
    client = MagicMock()
    client.get = MagicMock(side_effect=[identity_resp, project_resp])
    with patch.object(deps, "_get_verify_client", return_value=client), _taiga_config():
        with pytest.raises(HTTPException) as exc:
            deps.get_request_context("Bearer goodtoken", 42, None)
    assert exc.value.status_code == 403


def test_project_access_is_cached_per_token_and_project():
    pm, client = _mock_pm(200)
    with pm, _taiga_config():
        deps.get_request_context("Bearer goodtoken", 42, None)
        deps.get_request_context("Bearer goodtoken", 42, None)
    # 1 identity check + 1 project check, both cached on the second call
    assert client.get.call_count == 2


def test_different_project_revalidates():
    pm, client = _mock_pm(200)
    with pm, _taiga_config():
        deps.get_request_context("Bearer goodtoken", 42, None)
        deps.get_request_context("Bearer goodtoken", 43, None)
    assert client.get.call_count == 3  # identity once, projects 42 and 43


# ---------------------------------------------------------------------------
# Header parsing still enforced before any network call
# ---------------------------------------------------------------------------

def test_malformed_header_rejected_without_pm_call():
    pm, client = _mock_pm(200)
    with pm, _taiga_config():
        with pytest.raises(HTTPException) as exc:
            deps.get_auth_context("Basic dXNlcjpwYXNz")
    assert exc.value.status_code == 401
    assert client.get.call_count == 0


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
    url = client.get.call_args.args[0]
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
    url = client.get.call_args.args[0]
    assert url == "https://api.taiga.io/api/v1/users/me"


def test_header_anchor_used_when_no_server_anchor(monkeypatch):
    # Single-user/dev: nothing pinned (no env, config without taiga_url) → the
    # per-request X-Taiga-Url anchors validation (codex's private-instance flow).
    monkeypatch.delenv("TAIGA_API_URL", raising=False)
    pm, client = _mock_pm(200)
    with pm, _taiga_config(), _no_dns():
        deps.get_auth_context("Bearer privatetoken", "https://private.example.org")
    url = client.get.call_args.args[0]
    assert url == "https://private.example.org/api/v1/users/me"


def test_server_env_anchor_overrides_request_header(monkeypatch):
    # Multi-user security: a pinned server anchor (env) must beat the caller's
    # X-Taiga-Url so a rogue instance can't be used to rubber-stamp credentials.
    monkeypatch.setenv("TAIGA_API_URL", "https://api.taiga.io")
    pm, client = _mock_pm(200)
    with pm, _taiga_config(), _no_dns():
        deps.get_auth_context("Bearer tok", "https://rogue.example.org")
    url = client.get.call_args.args[0]
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
    url = client.get.call_args.args[0]
    assert url == "https://current-tunnel.example.org/api/v1/users/me"


def test_header_taiga_url_overrides_stale_jira_pm_tool(monkeypatch):
    # A present X-Taiga-Url is an unambiguous Taiga request even if shared config
    # still says jira (stale) — it must not be routed to the Jira anchor.
    monkeypatch.delenv("TAIGA_API_URL", raising=False)
    config = {"pm_tool": "jira", "jira_base_url": "https://acme.atlassian.net"}
    pm, client = _mock_pm(200)
    with pm, patch("src.context_manager.load_config", return_value=config), _no_dns():
        deps.get_auth_context("Bearer tok", "https://taiga.example.org")
    url = client.get.call_args.args[0]
    assert url == "https://taiga.example.org/api/v1/users/me"


def test_env_wins_over_config(monkeypatch):
    monkeypatch.setenv("TAIGA_API_URL", "https://env-tunnel.trycloudflare.com")
    config = {"pm_tool": "taiga", "taiga_url": "https://config.example.org"}
    pm, client = _mock_pm(200)
    with pm, patch("src.context_manager.load_config", return_value=config), _no_dns():
        deps.get_auth_context("Bearer sometoken")
    assert client.get.call_args.args[0].startswith("https://env-tunnel.trycloudflare.com")


def test_token_cache_is_scoped_to_identity_anchor(monkeypatch):
    monkeypatch.delenv("TAIGA_API_URL", raising=False)
    pm, client = _mock_pm(200)
    with pm, _taiga_config(), _no_dns():
        deps.get_auth_context("Bearer same-token", "https://one.example.org")
        deps.get_auth_context("Bearer same-token", "https://two.example.org")
    urls = [call.args[0] for call in client.get.call_args_list]
    assert urls == [
        "https://one.example.org/api/v1/users/me",
        "https://two.example.org/api/v1/users/me",
    ]


def test_default_anchor_is_taiga_cloud(monkeypatch):
    monkeypatch.delenv("TAIGA_API_URL", raising=False)
    pm, client = _mock_pm(200)
    with pm, _taiga_config(), _no_dns():
        deps.get_auth_context("Bearer cloudtoken")
    assert client.get.call_args.args[0] == "https://api.taiga.io/api/v1/users/me"


def test_private_anchor_url_rejected(monkeypatch):
    # A private-address anchor (e.g. stale config pointing at localhost) must
    # not be dialled — same SSRF rules as the proxy.
    monkeypatch.setenv("TAIGA_API_URL", "http://localhost:9000")
    with _taiga_config():
        with pytest.raises(HTTPException) as exc:
            deps.get_auth_context("Bearer sometoken")
    assert exc.value.status_code == 400
