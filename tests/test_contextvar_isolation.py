"""Stress-test ContextVar isolation across concurrent threads.

Verifies that concurrent FastAPI-style requests on different project_ids
never bleed state into each other through the _active_project_id ContextVar.
"""

import concurrent.futures
import contextvars
import time

import pytest


def test_contextvar_project_isolation_concurrent():
    """20 concurrent threads with distinct project_ids must each see their own id."""
    from src import context_manager as cm

    project_ids = list(range(5000, 5020))
    results: dict[int, int] = {}
    errors: list[str] = []

    def simulate_request(pid: int) -> None:
        token = cm._active_project_id.set(pid)
        try:
            time.sleep(0.02)  # increase race probability
            seen = cm._get_project_id()
            results[pid] = seen
        finally:
            cm._active_project_id.reset(token)

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
        futures = [
            pool.submit(contextvars.copy_context().run, simulate_request, pid)
            for pid in project_ids
        ]
        for f in concurrent.futures.as_completed(futures):
            exc = f.exception()
            if exc:
                errors.append(str(exc))

    assert not errors, f"Thread errors: {errors}"
    for pid in project_ids:
        assert pid in results, f"No result for project {pid}"
        assert results[pid] == pid, (
            f"Thread for project {pid} saw {results[pid]} — ContextVar leaked"
        )


def test_contextvar_cache_isolation_concurrent(tmp_path, monkeypatch):
    """Concurrent threads writing to different project caches must not cross-contaminate."""
    from src import context_manager as cm

    test_base = tmp_path / "ctx"
    test_base.mkdir()
    monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", test_base)
    monkeypatch.setattr(cm, "_initialized_projects", set())
    monkeypatch.setattr(cm, "_story_index_caches", {})

    written: dict[int, str] = {}
    read_back: dict[int, str] = {}

    def simulate_write_read(pid: int) -> None:
        token = cm._active_project_id.set(pid)
        try:
            cm.init_context()
            # Write a unique marker to this project's story index cache
            marker = f"project-{pid}-marker"
            cm._story_index_caches[pid] = {f"story-{pid}": {"title": marker}}
            time.sleep(0.01)
            index = cm.get_story_index()
            read_back[pid] = list(index.values())[0]["title"] if index else ""
            written[pid] = marker
        finally:
            cm._active_project_id.reset(token)

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        pids = list(range(7000, 7010))
        futures = [
            pool.submit(contextvars.copy_context().run, simulate_write_read, pid)
            for pid in pids
        ]
        concurrent.futures.wait(futures)

    for pid in pids:
        assert read_back.get(pid) == written.get(pid), (
            f"Project {pid} read back {read_back.get(pid)!r} "
            f"instead of {written.get(pid)!r} — cache isolation broken"
        )
