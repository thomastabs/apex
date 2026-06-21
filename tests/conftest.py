"""Shared pytest fixtures for apex tests."""

import pytest

_TEST_PROJECT_ID = 99999


@pytest.fixture(autouse=True)
def _disable_distributed(monkeypatch):
    """Default every test to the process-local (single-replica) primitives.

    A dev with REDIS_URL in their .env (multi-replica enabled) must not have the
    suite connect to real Redis — it would bypass the local lock/cache code paths
    and hit the network. test_distributed opts back in via its fake_redis fixture,
    which sets the client directly (overriding this)."""
    from src import distributed

    monkeypatch.delenv("REDIS_URL", raising=False)
    distributed.reset_for_tests()
    yield
    distributed.reset_for_tests()


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

    monkeypatch.setattr(deps, "_verify_pm_token", lambda token, taiga_url_override="": None)
    monkeypatch.setattr(deps, "_verify_project_access", lambda token, project_id, taiga_url_override="": None)
    # get_request_context derives the storage instance_id from _resolve_anchor_base,
    # which runs SSRF/DNS validation. Stub it so bypassed tests stay offline and the
    # namespace is deterministic ("api_taiga_io").
    monkeypatch.setattr(deps, "_resolve_anchor_base", lambda override="": ("taiga", "https://api.taiga.io/api/v1"))
    yield


@pytest.fixture(autouse=True)
def _reset_rate_limit_buckets():
    """Rate-limit buckets are module-global; TestClient requests all share the
    'testclient' source IP, so attempts/failures would leak across tests."""
    from backend.app.api import rate_limit

    rate_limit._buckets.clear()
    rate_limit._failure_buckets.clear()
    rate_limit._username_failure_buckets.clear()
    yield
    rate_limit._buckets.clear()
    rate_limit._failure_buckets.clear()
    rate_limit._username_failure_buckets.clear()


@pytest.fixture(autouse=True)
def _force_local_storage(monkeypatch):
    """Tests must never touch a real Azure File Share. When the dev shell has
    AZURE_STORAGE_CONNECTION_STRING set, StoragePath would otherwise dial Azure;
    pin storage to local-disk mode for every test. (test_storage_azure exercises
    the _az_* helpers directly, so this doesn't affect it.)"""
    from src import storage

    monkeypatch.setattr(storage, "_USE_AZURE", False, raising=False)


@pytest.fixture(autouse=True)
def _isolate_active_context():
    """Reset the per-request ContextVars to defaults around every test.

    Services set _active_instance_id / _active_project_id during a request and
    don't reset them, so without this a TestClient test leaks its namespace into
    later tests that read context files (instance-scoped storage, audit)."""
    from src import context_manager as cm

    p = cm._active_project_id.set(0)
    i = cm._active_instance_id.set("default")
    yield
    cm._active_project_id.reset(p)
    cm._active_instance_id.reset(i)


@pytest.fixture(autouse=True)
def _reset_config_cache():
    """The workspace-config cache (audit H4) is module-global and TTL'd; clear it
    around every test so a cached config never bleeds across tests."""
    from src import context_manager as cm

    cm._invalidate_config_cache()
    yield
    cm._invalidate_config_cache()


@pytest.fixture()
def ctx(tmp_path, monkeypatch):
    """Patch context_manager to use an isolated tmp directory for each test.

    Sets the ContextVar to a fixed test project_id and redirects _BASE_CONTEXTSPEC
    to a tmp_path so tests never share filesystem state.  Per-project caches are
    replaced with fresh objects so tests never bleed in-memory state into each other.
    """
    from src import context_manager as cm
    from src.storage import StoragePath

    test_base = tmp_path / "contextspec"
    test_base.mkdir()

    # Redirect file storage — _context_dir() and _path() derive from this. Use a
    # StoragePath so the storage-abstraction methods (iterdir_dirs/rmdir/is_dir)
    # are available in tests, matching production.
    monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", StoragePath(str(test_base)))

    # Isolated per-test caches (monkeypatch restores originals after each test).
    monkeypatch.setattr(cm, "_initialized_projects", set())
    monkeypatch.setattr(cm, "_story_index_caches", {})

    # Set ContextVars (project + instance namespace) for the test's duration.
    token = cm._active_project_id.set(_TEST_PROJECT_ID)
    itoken = cm._active_instance_id.set("default")

    yield cm

    cm._active_project_id.reset(token)
    cm._active_instance_id.reset(itoken)
