"""Tests for the real GithubActionsClient HTTP layer (src/backend/app/services/github_actions.py).

Every Phase 5 test fakes this class entirely (FakeGithubActionsClient in
test_backend_phase5.py), so _request()'s status-code error mapping and the
parse_repo()/workflow_api_id() helpers had zero direct coverage — flagged in
the 2026-07-21 full-repo audit. Uses httpx.MockTransport (stdlib to httpx, no
extra dependency) instead of hitting the real GitHub API.
"""

import json

import httpx
import pytest

from backend.app.services.github_actions import (
    GithubActionsClient,
    GithubActionsError,
    GithubRepo,
    parse_repo,
    workflow_api_id,
)


# ---------------------------------------------------------------------------
# parse_repo
# ---------------------------------------------------------------------------

def test_parse_repo_owner_slash_repo():
    assert parse_repo("acme/widgets") == GithubRepo(owner="acme", repo="widgets")


def test_parse_repo_strips_https_prefix_and_git_suffix():
    assert parse_repo("https://github.com/acme/widgets.git") == GithubRepo(owner="acme", repo="widgets")


def test_parse_repo_full_name_property():
    assert GithubRepo(owner="acme", repo="widgets").full_name == "acme/widgets"


@pytest.mark.parametrize("bad", ["", "no-slash", "too/many/slashes", "acme/", "/widgets", "acme/wid gets"])
def test_parse_repo_rejects_invalid_format(bad):
    with pytest.raises(GithubActionsError):
        parse_repo(bad)


# ---------------------------------------------------------------------------
# workflow_api_id
# ---------------------------------------------------------------------------

def test_workflow_api_id_numeric_passthrough():
    assert workflow_api_id(12345) == "12345"
    assert workflow_api_id("12345") == "12345"


def test_workflow_api_id_bare_filename_passthrough():
    assert workflow_api_id("deploy.yml") == "deploy.yml"


def test_workflow_api_id_collapses_full_path_to_basename():
    assert workflow_api_id(".github/workflows/deploy.yml") == "deploy.yml"


def test_workflow_api_id_empty_raises():
    with pytest.raises(GithubActionsError):
        workflow_api_id("")
    with pytest.raises(GithubActionsError):
        workflow_api_id(None)


# ---------------------------------------------------------------------------
# GithubActionsClient construction
# ---------------------------------------------------------------------------

def test_client_requires_pat():
    with pytest.raises(GithubActionsError):
        GithubActionsClient("", "acme/widgets")
    with pytest.raises(GithubActionsError):
        GithubActionsClient("   ", "acme/widgets")


def test_client_requires_valid_repo():
    with pytest.raises(GithubActionsError):
        GithubActionsClient("tok", "not-a-repo")


# ---------------------------------------------------------------------------
# _request status-code mapping, via httpx.MockTransport
# ---------------------------------------------------------------------------

def _client_with_transport(monkeypatch, handler) -> GithubActionsClient:
    """Patch httpx.Client construction so GithubActionsClient._request() routes
    through a MockTransport instead of the network."""
    import backend.app.services.github_actions as mod

    real_client_cls = httpx.Client

    def fake_client(*, follow_redirects, timeout):
        return real_client_cls(follow_redirects=follow_redirects, timeout=timeout, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(mod.httpx, "Client", fake_client)
    return GithubActionsClient("tok", "acme/widgets")


def test_request_401_raises_with_status_code(monkeypatch):
    def handler(request):
        return httpx.Response(401, json={"message": "Bad credentials"})

    client = _client_with_transport(monkeypatch, handler)
    with pytest.raises(GithubActionsError) as ei:
        client.list_workflows()
    assert ei.value.status_code == 401


def test_request_403_raises_with_status_code(monkeypatch):
    def handler(request):
        return httpx.Response(403, json={"message": "Forbidden"})

    client = _client_with_transport(monkeypatch, handler)
    with pytest.raises(GithubActionsError) as ei:
        client.list_workflows()
    assert ei.value.status_code == 403


def test_request_404_raises_and_workflow_returns_none(monkeypatch):
    def handler(request):
        return httpx.Response(404, json={"message": "Not Found"})

    client = _client_with_transport(monkeypatch, handler)
    with pytest.raises(GithubActionsError) as ei:
        client.list_workflows()
    assert ei.value.status_code == 404

    # workflow()/run() specifically swallow 404 into None instead of raising.
    assert client.workflow("deploy.yml") is None
    assert client.run(1) is None


def test_request_422_includes_github_error_detail(monkeypatch):
    def handler(request):
        return httpx.Response(422, json={"message": "Validation failed", "errors": ["ref is required"]})

    client = _client_with_transport(monkeypatch, handler)
    with pytest.raises(GithubActionsError) as ei:
        client.dispatch("deploy.yml", ref="main", inputs={})
    assert ei.value.status_code == 422
    assert "Validation failed" in str(ei.value)


def test_request_5xx_raises_with_status_code(monkeypatch):
    def handler(request):
        return httpx.Response(503, text="upstream unavailable")

    client = _client_with_transport(monkeypatch, handler)
    with pytest.raises(GithubActionsError) as ei:
        client.list_workflows()
    assert ei.value.status_code == 503
    assert "upstream unavailable" in str(ei.value)


def test_request_network_error_wraps_in_github_actions_error(monkeypatch):
    def handler(request):
        raise httpx.ConnectError("connection refused", request=request)

    client = _client_with_transport(monkeypatch, handler)
    with pytest.raises(GithubActionsError) as ei:
        client.list_workflows()
    assert ei.value.status_code is None
    assert "Failed to reach GitHub Actions" in str(ei.value)


def test_request_200_returns_response(monkeypatch):
    def handler(request):
        return httpx.Response(200, json={"workflows": [{"id": 1, "name": "CI"}]})

    client = _client_with_transport(monkeypatch, handler)
    assert client.list_workflows() == [{"id": 1, "name": "CI"}]


# ---------------------------------------------------------------------------
# Request shaping — headers, dispatch body, list_runs params
# ---------------------------------------------------------------------------

def test_request_sends_bearer_auth_and_api_version_headers(monkeypatch):
    captured = {}

    def handler(request):
        captured["headers"] = request.headers
        return httpx.Response(200, json={"workflows": []})

    client = _client_with_transport(monkeypatch, handler)
    client.list_workflows()
    assert captured["headers"]["authorization"] == "Bearer tok"
    assert captured["headers"]["x-github-api-version"] == "2022-11-28"


def test_dispatch_sends_ref_and_filters_blank_input_keys(monkeypatch):
    captured = {}

    def handler(request):
        captured["url"] = str(request.url)
        captured["json"] = json.loads(request.content)
        return httpx.Response(204)

    client = _client_with_transport(monkeypatch, handler)
    client.dispatch("deploy.yml", ref="release/1.0", inputs={"env": "prod", "  ": "dropped"})

    assert captured["url"].endswith("/repos/acme/widgets/actions/workflows/deploy.yml/dispatches")
    assert captured["json"] == {"ref": "release/1.0", "inputs": {"env": "prod"}}


def test_dispatch_defaults_ref_to_main_when_blank(monkeypatch):
    captured = {}

    def handler(request):
        captured["json"] = json.loads(request.content)
        return httpx.Response(204)

    client = _client_with_transport(monkeypatch, handler)
    client.dispatch("deploy.yml", ref="  ", inputs={})

    assert captured["json"] == {"ref": "main"}


def test_list_runs_builds_query_params(monkeypatch):
    captured = {}

    def handler(request):
        captured["params"] = dict(request.url.params)
        return httpx.Response(200, json={"workflow_runs": []})

    client = _client_with_transport(monkeypatch, handler)
    client.list_runs("deploy.yml", branch="main", event="workflow_dispatch", per_page=5)

    assert captured["params"] == {"per_page": "5", "branch": "main", "event": "workflow_dispatch"}


def test_run_invalid_id_raises_before_any_request(monkeypatch):
    def handler(request):
        raise AssertionError("should not be called for an invalid run id")

    client = _client_with_transport(monkeypatch, handler)
    with pytest.raises(GithubActionsError):
        client.run("not-an-int")
