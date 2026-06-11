"""Shared pytest fixtures for apex tests."""

import pytest

_TEST_PROJECT_ID = 99999


@pytest.fixture(autouse=True)
def _bypass_pm_auth(request, monkeypatch):
    """Skip PM credential validation in tests.

    deps.get_auth_context / get_request_context verify tokens against the
    real PM tool; tests use fake tokens and must not hit the network. Tests
    of the validation itself opt out with @pytest.mark.real_auth.
    """
    if request.node.get_closest_marker("real_auth"):
        yield
        return
    from backend.app.api import deps

    monkeypatch.setattr(deps, "_verify_pm_token", lambda token: None)
    monkeypatch.setattr(deps, "_verify_project_access", lambda token, project_id: None)
    yield


@pytest.fixture()
def ctx(tmp_path, monkeypatch):
    """Patch context_manager to use an isolated tmp directory for each test.

    Sets the ContextVar to a fixed test project_id and redirects _BASE_CONTEXTSPEC
    to a tmp_path so tests never share filesystem state.  Per-project caches are
    replaced with fresh objects so tests never bleed in-memory state into each other.
    """
    from src import context_manager as cm

    test_base = tmp_path / "contextspec"
    test_base.mkdir()

    # Redirect file storage — _context_dir() and _path() derive from this.
    monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", test_base)

    # Isolated per-test caches (monkeypatch restores originals after each test).
    monkeypatch.setattr(cm, "_initialized_projects", set())
    monkeypatch.setattr(cm, "_story_index_caches", {})

    # Set ContextVar to test project_id for the duration of this test.
    token = cm._active_project_id.set(_TEST_PROJECT_ID)

    yield cm

    cm._active_project_id.reset(token)
