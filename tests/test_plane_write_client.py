"""Tests for backend/app/services/plane_write_client.py — Autopilot's direct
(non-proxied) Plane write helpers (phase 5b, see plane_integration_plan memory).

Mocks at the httpx.request level (patching plane_write_client._pinned to a
no-op passthrough so no real DNS/SSRF pinning happens) — never a real network
call. Mirrors tests/test_backend_autopilot.py's idioms for the Taiga
equivalents (_taiga_post/_taiga_delete)."""

from unittest.mock import MagicMock

import httpx
import pytest

from backend.app.services import plane_write_client as pwc

_BASE = "https://plane.example.test/api/v1"
_SLUG = "my-team"
_PROJECT_ID = "proj-1"
_TOKEN = "plane_pat_abc"


@pytest.fixture(autouse=True)
def _bypass_pin(monkeypatch):
    """No real DNS/SSRF pinning — return the url/headers unchanged."""
    monkeypatch.setattr(pwc, "_pinned", lambda url, headers: (url, headers, {}))


def _resp(status_code: int, json_body: dict | None = None, raise_error: bool = False) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    if json_body is not None:
        resp.json.return_value = json_body
    if raise_error:
        def _raise():
            raise httpx.HTTPStatusError("error", request=MagicMock(), response=resp)
        resp.raise_for_status.side_effect = _raise
    else:
        resp.raise_for_status.return_value = None
    return resp


# ---------------------------------------------------------------------------
# create_epic_or_module
# ---------------------------------------------------------------------------

class TestCreateEpicOrModule:
    def test_epics_success_path(self, monkeypatch):
        calls = []

        def _fake_request(method, url, **kwargs):
            calls.append((method, url, kwargs))
            return _resp(201, {"id": "epic-uuid-1"})

        monkeypatch.setattr(httpx, "request", _fake_request)

        uuid, source = pwc.create_epic_or_module(
            _BASE, _SLUG, _PROJECT_ID, _TOKEN, "Auth", "Login/signup epic",
        )

        assert (uuid, source) == ("epic-uuid-1", "epics")
        assert len(calls) == 1
        method, url, kwargs = calls[0]
        assert method == "POST"
        assert url == f"{_BASE}/workspaces/{_SLUG}/projects/{_PROJECT_ID}/epics/"
        assert kwargs["headers"]["X-Api-Key"] == _TOKEN
        assert kwargs["json"] == {
            "name": "Auth", "description_html": "<p>Login/signup epic</p>", "label_ids": [],
        }

    def test_epics_402_falls_back_to_modules(self, monkeypatch):
        calls = []

        def _fake_request(method, url, **kwargs):
            calls.append((method, url, kwargs))
            if url.endswith("/epics/"):
                return _resp(402, {"error": "Payment required", "error_code": 1999})
            return _resp(201, {"id": "module-uuid-1"})

        monkeypatch.setattr(httpx, "request", _fake_request)

        uuid, source = pwc.create_epic_or_module(
            _BASE, _SLUG, _PROJECT_ID, _TOKEN, "Auth", "Login/signup epic",
        )

        assert (uuid, source) == ("module-uuid-1", "modules")
        assert len(calls) == 2
        first_url, second_url = calls[0][1], calls[1][1]
        assert first_url.endswith("/epics/")
        assert second_url == f"{_BASE}/workspaces/{_SLUG}/projects/{_PROJECT_ID}/modules/"
        # Modules take a plain "description" string, not description_html.
        assert calls[1][2]["json"] == {"name": "Auth", "description": "Login/signup epic"}

    @pytest.mark.parametrize("status", [403, 404])
    def test_other_gated_statuses_also_fall_back(self, monkeypatch, status):
        def _fake_request(method, url, **kwargs):
            if url.endswith("/epics/"):
                return _resp(status)
            return _resp(201, {"id": "module-uuid-2"})

        monkeypatch.setattr(httpx, "request", _fake_request)

        uuid, source = pwc.create_epic_or_module(_BASE, _SLUG, _PROJECT_ID, _TOKEN, "T", "D")
        assert (uuid, source) == ("module-uuid-2", "modules")

    def test_non_gated_error_status_raises_without_fallback(self, monkeypatch):
        calls = []

        def _fake_request(method, url, **kwargs):
            calls.append(url)
            return _resp(500, raise_error=True)

        monkeypatch.setattr(httpx, "request", _fake_request)

        with pytest.raises(httpx.HTTPStatusError):
            pwc.create_epic_or_module(_BASE, _SLUG, _PROJECT_ID, _TOKEN, "T", "D")
        assert len(calls) == 1  # never fell through to modules for a non-gated error


# ---------------------------------------------------------------------------
# create_work_item
# ---------------------------------------------------------------------------

class TestCreateWorkItem:
    def test_creates_and_returns_uuid(self, monkeypatch):
        calls = []

        def _fake_request(method, url, **kwargs):
            calls.append((method, url, kwargs))
            return _resp(201, {"id": "story-uuid-1"})

        monkeypatch.setattr(httpx, "request", _fake_request)

        uuid = pwc.create_work_item(_BASE, _SLUG, _PROJECT_ID, _TOKEN, "Sign in", "Scenario: user signs in")

        assert uuid == "story-uuid-1"
        method, url, kwargs = calls[0]
        assert method == "POST"
        assert url == f"{_BASE}/workspaces/{_SLUG}/projects/{_PROJECT_ID}/work-items/"
        assert kwargs["json"] == {
            "name": "Sign in", "description_html": "<p>Scenario: user signs in</p>",
        }

    def test_raises_on_error(self, monkeypatch):
        monkeypatch.setattr(httpx, "request", lambda method, url, **kw: _resp(500, raise_error=True))
        with pytest.raises(httpx.HTTPStatusError):
            pwc.create_work_item(_BASE, _SLUG, _PROJECT_ID, _TOKEN, "Sign in", "")


# ---------------------------------------------------------------------------
# join_work_item — two different body shapes for epics vs modules
# ---------------------------------------------------------------------------

class TestJoinWorkItem:
    def test_epics_group_uses_work_item_ids_body(self, monkeypatch):
        calls = []

        def _fake_request(method, url, **kwargs):
            calls.append((method, url, kwargs))
            return _resp(200)

        monkeypatch.setattr(httpx, "request", _fake_request)

        pwc.join_work_item(_BASE, _SLUG, _PROJECT_ID, _TOKEN, "epics", "epic-uuid-1", "story-uuid-1")

        method, url, kwargs = calls[0]
        assert method == "POST"
        assert url == f"{_BASE}/workspaces/{_SLUG}/projects/{_PROJECT_ID}/epics/epic-uuid-1/issues/"
        assert kwargs["json"] == {"work_item_ids": ["story-uuid-1"]}

    def test_modules_group_uses_issues_body(self, monkeypatch):
        calls = []

        def _fake_request(method, url, **kwargs):
            calls.append((method, url, kwargs))
            return _resp(200)

        monkeypatch.setattr(httpx, "request", _fake_request)

        pwc.join_work_item(_BASE, _SLUG, _PROJECT_ID, _TOKEN, "modules", "module-uuid-1", "story-uuid-1")

        method, url, kwargs = calls[0]
        assert method == "POST"
        assert url == f"{_BASE}/workspaces/{_SLUG}/projects/{_PROJECT_ID}/modules/module-uuid-1/module-issues/"
        assert kwargs["json"] == {"issues": ["story-uuid-1"]}

    def test_raises_on_non_2xx(self, monkeypatch):
        monkeypatch.setattr(httpx, "request", lambda method, url, **kw: _resp(500, raise_error=True))
        with pytest.raises(httpx.HTTPStatusError):
            pwc.join_work_item(_BASE, _SLUG, _PROJECT_ID, _TOKEN, "epics", "epic-uuid-1", "story-uuid-1")


# ---------------------------------------------------------------------------
# create_task — carries the parent work item id
# ---------------------------------------------------------------------------

class TestCreateTask:
    def test_body_carries_parent_field(self, monkeypatch):
        calls = []

        def _fake_request(method, url, **kwargs):
            calls.append((method, url, kwargs))
            return _resp(201, {"id": "task-uuid-1"})

        monkeypatch.setattr(httpx, "request", _fake_request)

        uuid = pwc.create_task(
            _BASE, _SLUG, _PROJECT_ID, _TOKEN, "story-uuid-1", "Write tests", "some desc",
        )

        assert uuid == "task-uuid-1"
        method, url, kwargs = calls[0]
        assert method == "POST"
        assert url == f"{_BASE}/workspaces/{_SLUG}/projects/{_PROJECT_ID}/work-items/"
        assert kwargs["json"] == {
            "name": "Write tests", "description_html": "<p>some desc</p>", "parent": "story-uuid-1",
        }

    def test_raises_on_error(self, monkeypatch):
        monkeypatch.setattr(httpx, "request", lambda method, url, **kw: _resp(500, raise_error=True))
        with pytest.raises(httpx.HTTPStatusError):
            pwc.create_task(_BASE, _SLUG, _PROJECT_ID, _TOKEN, "story-uuid-1", "T", "")


# ---------------------------------------------------------------------------
# delete_work_item — 404-is-success tolerance, real errors still raise
# ---------------------------------------------------------------------------

class TestDeleteWorkItem:
    @pytest.mark.parametrize("status", [200, 204, 404])
    def test_success_statuses_do_not_raise(self, monkeypatch, status):
        resp = _resp(status, raise_error=True)  # would raise if ever called

        def _fake_request(method, url, **kwargs):
            assert method == "DELETE"
            assert url == f"{_BASE}/workspaces/{_SLUG}/projects/{_PROJECT_ID}/work-items/story-uuid-1/"
            return resp

        monkeypatch.setattr(httpx, "request", _fake_request)

        pwc.delete_work_item(_BASE, _SLUG, _PROJECT_ID, _TOKEN, "story-uuid-1")  # must not raise
        resp.raise_for_status.assert_not_called()

    def test_real_error_still_raises(self, monkeypatch):
        resp = _resp(500, raise_error=True)
        monkeypatch.setattr(httpx, "request", lambda method, url, **kw: resp)

        with pytest.raises(httpx.HTTPStatusError):
            pwc.delete_work_item(_BASE, _SLUG, _PROJECT_ID, _TOKEN, "story-uuid-1")
        resp.raise_for_status.assert_called_once()
