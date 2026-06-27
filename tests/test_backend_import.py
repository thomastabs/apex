"""Tests for the Taiga import (Option C onboarding) service + routes.

Covers the pure helpers (status mapping, epic-id extraction), pagination,
the no-AI bootstrap, the per-epic Gherkin reconstruction, and the two API
routes (happy path + 502 on Taiga failure).
"""

import pytest
from fastapi import HTTPException

from backend.app.services import import_service as svc
from backend.app.services.request_context import RequestContext


# ---------------------------------------------------------------------------
# _map_taiga_status — heuristic Taiga status → Apex phase_status
# ---------------------------------------------------------------------------

def test_map_status_closed_is_deployed():
    assert svc._map_taiga_status({"name": "Done", "is_closed": True}) == "deployed"


@pytest.mark.parametrize("name", ["In progress", "Doing", "Dev", "Implementing", "Coding", "Building"])
def test_map_status_in_progress_is_implementation(name):
    assert svc._map_taiga_status({"name": name}) == "implementation"


@pytest.mark.parametrize("name", ["Testing", "QA", "In review", "Verifying", "Staging", "Ready for test"])
def test_map_status_test_is_qa(name):
    assert svc._map_taiga_status({"name": name}) == "qa"


def test_map_status_unknown_defaults_gherkin_locked():
    assert svc._map_taiga_status({"name": "New"}) == "gherkin_locked"


def test_map_status_closed_wins_over_name():
    # is_closed short-circuits before the name heuristics.
    assert svc._map_taiga_status({"name": "In progress", "is_closed": True}) == "deployed"


def test_map_status_matches_on_slug():
    assert svc._map_taiga_status({"name": "", "slug": "in-progress"}) == "implementation"


# ---------------------------------------------------------------------------
# _extract_epic_id — mirrors taiga-direct.ts normalizeStory precedence
# ---------------------------------------------------------------------------

def test_extract_epic_id_from_int():
    assert svc._extract_epic_id({"epic": 7}) == 7


def test_extract_epic_id_from_epic_dict():
    assert svc._extract_epic_id({"epic": {"id": 9}}) == 9


def test_extract_epic_id_from_epic_extra_info():
    # The regression c6f6b58 fixed: list endpoints return epic_extra_info, not epic:int.
    assert svc._extract_epic_id({"epic": None, "epic_extra_info": {"id": 12, "subject": "X"}}) == 12


def test_extract_epic_id_from_epics_array():
    assert svc._extract_epic_id({"epic": None, "epics": [{"id": 15}]}) == 15


def test_extract_epic_id_int_wins_over_extra_info():
    assert svc._extract_epic_id({"epic": 3, "epic_extra_info": {"id": 99}}) == 3


def test_extract_epic_id_none_when_no_epic():
    assert svc._extract_epic_id({"epic": None}) is None
    assert svc._extract_epic_id({}) is None


# ---------------------------------------------------------------------------
# _taiga_get_all — pagination
# ---------------------------------------------------------------------------

def test_paginate_stops_on_short_page(monkeypatch):
    pages = {
        1: [{"id": i} for i in range(svc._PAGE_SIZE)],   # full page → fetch next
        2: [{"id": 1000}, {"id": 1001}],                 # short page → stop
    }
    calls = []

    def fake_get(url, token, params=None):
        calls.append(params["page"])
        return pages.get(params["page"], [])

    monkeypatch.setattr(svc, "_taiga_get", fake_get)
    out = svc._taiga_get_all("http://x/userstories", "tok")

    assert len(out) == svc._PAGE_SIZE + 2
    assert calls == [1, 2]


def test_paginate_unwraps_objects_dict(monkeypatch):
    monkeypatch.setattr(svc, "_taiga_get", lambda url, tok, params=None: {"objects": [{"id": 1}]})
    out = svc._taiga_get_all("http://x", "tok")
    assert out == [{"id": 1}]


def test_paginate_honours_max_pages_cap(monkeypatch):
    # Every page is full → would loop forever without the cap.
    monkeypatch.setattr(svc, "_taiga_get", lambda url, tok, params=None: [{"id": 0}] * svc._PAGE_SIZE)
    out = svc._taiga_get_all("http://x", "tok")
    assert len(out) == svc._PAGE_SIZE * svc._MAX_PAGES


# ---------------------------------------------------------------------------
# bootstrap — Step 1, no AI
# ---------------------------------------------------------------------------

def _wire_taiga(monkeypatch, *, statuses, epics, stories):
    """Patch the two network helpers to serve canned Taiga responses by URL."""
    def fake_get(url, token, params=None):
        if url.endswith("/userstories/statuses"):
            return statuses
        return []

    def fake_get_all(url, token, params=None):
        if url.endswith("/epics"):
            return epics
        if url.endswith("/userstories"):
            # honour an epic filter when reconstruct_epic passes one
            epic_filter = (params or {}).get("epic")
            if epic_filter is not None:
                return [s for s in stories if svc._extract_epic_id(s) == epic_filter]
            return stories
        return []

    monkeypatch.setattr(svc, "_taiga_get", fake_get)
    monkeypatch.setattr(svc, "_taiga_get_all", fake_get_all)


def test_bootstrap_imports_maps_and_groups(ctx, monkeypatch):
    _wire_taiga(
        monkeypatch,
        statuses=[
            {"id": 1, "name": "New"},
            {"id": 2, "name": "In progress"},
            {"id": 3, "name": "Done", "is_closed": True},
        ],
        epics=[{"id": 10, "subject": "Auth"}],
        stories=[
            {"id": 100, "subject": "Login", "status": 2, "epic": 10},
            {"id": 101, "subject": "Logout", "status": 3, "epic_extra_info": {"id": 10}},
            {"id": 102, "subject": "Orphan", "status": 1, "epic": None},
        ],
    )

    report = svc.bootstrap("https://api.taiga.io/api/v1", "tok", 42)

    assert report["imported"] == 3
    assert report["skipped"] == 0

    index = ctx.get_story_index()
    assert index["100"]["phase_status"] == "implementation"
    assert index["100"]["epic_id"] == 10
    assert index["101"]["phase_status"] == "deployed"
    assert index["101"]["epic_id"] == 10          # resolved via epic_extra_info
    assert index["102"]["epic_id"] == svc._GENERAL_EPIC_ID
    assert index["102"]["epic_title"] == svc._GENERAL_EPIC_TITLE
    assert index["102"]["phase_status"] == "gherkin_locked"

    # epics summary groups the two real-epic stories + the orphan separately
    counts = {e["id"]: e["story_count"] for e in report["epics"]}
    assert counts == {10: 2, svc._GENERAL_EPIC_ID: 1}


def test_bootstrap_skips_existing_and_is_idempotent(ctx, monkeypatch):
    args = dict(
        statuses=[{"id": 1, "name": "New"}],
        epics=[{"id": 10, "subject": "Auth"}],
        stories=[{"id": 100, "subject": "Login", "status": 1, "epic": 10}],
    )
    _wire_taiga(monkeypatch, **args)

    first = svc.bootstrap("https://api.taiga.io/api/v1", "tok", 42)
    assert first["imported"] == 1 and first["skipped"] == 0

    # Re-run: the story is already in the index → skipped, nothing re-imported.
    second = svc.bootstrap("https://api.taiga.io/api/v1", "tok", 42)
    assert second["imported"] == 0 and second["skipped"] == 1


def test_bootstrap_unmapped_status_id_defaults_gherkin_locked(ctx, monkeypatch):
    _wire_taiga(
        monkeypatch,
        statuses=[{"id": 1, "name": "In progress"}],
        epics=[],
        stories=[{"id": 100, "subject": "S", "status": 999, "epic": None}],  # status id not in map
    )
    svc.bootstrap("https://api.taiga.io/api/v1", "tok", 42)
    assert ctx.get_story_index()["100"]["phase_status"] == "gherkin_locked"


# ---------------------------------------------------------------------------
# reconstruct_epic — Step 2, AI per epic
# ---------------------------------------------------------------------------

def test_reconstruct_empty_epic_returns_empty(ctx, monkeypatch):
    monkeypatch.setattr(svc, "_taiga_get_all", lambda *a, **k: [])
    out = svc.reconstruct_epic(10, "https://api.taiga.io/api/v1", "tok", 42)
    assert out == {"epic_id": 10, "epic_title": "Epic 10", "results": []}


def test_reconstruct_writes_gherkin_and_advances(ctx, monkeypatch):
    ctx.upsert_story_index(100, title="Login", epic_id=10, epic_title="Auth",
                           phase_status="gherkin_locked", has_gherkin=False)
    ctx.upsert_story_index(101, title="Logout", epic_id=10, epic_title="Auth",
                           phase_status="gherkin_locked", has_gherkin=False)

    monkeypatch.setattr(svc, "_taiga_get_all", lambda *a, **k: [
        {"id": 100, "subject": "Login", "description": "user logs in"},
        {"id": 101, "subject": "Logout", "description": "user logs out"},
    ])
    # AI returns Gherkin for 100 only; 101 gets nothing → skipped.
    monkeypatch.setattr(
        "src.ai_engine.reconstruct_gherkin_batch",
        lambda title, items: {100: "Feature: Login\n  Scenario: ok", 101: "   "},
    )

    out = svc.reconstruct_epic(10, "https://api.taiga.io/api/v1", "tok", 42)

    by_id = {r["story_id"]: r for r in out["results"]}
    assert by_id[100]["status"] == "ok"
    assert by_id[101]["status"] == "skipped"
    # the written story now has gherkin recorded in the index
    assert ctx.get_story_index()["100"]["has_gherkin"] is True


def test_reconstruct_general_epic_filters_orphans(ctx, monkeypatch):
    ctx.upsert_story_index(102, title="Orphan", epic_id=svc._GENERAL_EPIC_ID,
                           epic_title=svc._GENERAL_EPIC_TITLE,
                           phase_status="gherkin_locked", has_gherkin=False)

    # General-epic path fetches ALL stories then filters to epic-less ones.
    monkeypatch.setattr(svc, "_taiga_get_all", lambda *a, **k: [
        {"id": 102, "subject": "Orphan", "description": "d", "epic": None},
        {"id": 200, "subject": "HasEpic", "description": "d", "epic": 10},  # filtered out
    ])
    captured = {}
    def fake_ai(title, items):
        captured["ids"] = [i["id"] for i in items]
        return {102: "Feature: Orphan"}
    monkeypatch.setattr("src.ai_engine.reconstruct_gherkin_batch", fake_ai)

    out = svc.reconstruct_epic(svc._GENERAL_EPIC_ID, "https://api.taiga.io/api/v1", "tok", 42)

    assert out["epic_title"] == svc._GENERAL_EPIC_TITLE
    assert captured["ids"] == [102]   # only the index entry, story 200 not in this epic
    assert out["results"][0]["status"] == "ok"


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

_CTX = RequestContext(pm_token="tok", project_id=42)


def test_route_bootstrap_happy(ctx, monkeypatch):
    from backend.app.api import workspace

    # The route imports import_service lazily, so it's the same module object as svc.
    monkeypatch.setattr(svc, "bootstrap",
                        lambda base, token, pid: {"imported": 1, "skipped": 0, "epics": [], "status_mapping": []})

    out = workspace.import_from_pm_bootstrap(ctx=_CTX, x_taiga_url="")
    assert out["imported"] == 1


def test_route_bootstrap_taiga_failure_is_502(ctx, monkeypatch):
    from backend.app.api import workspace

    def boom(*a, **k):
        raise RuntimeError("taiga down")
    monkeypatch.setattr(svc, "bootstrap", boom)

    with pytest.raises(HTTPException) as ei:
        workspace.import_from_pm_bootstrap(ctx=_CTX, x_taiga_url="")
    assert ei.value.status_code == 502


def test_route_reconstruct_happy(ctx, monkeypatch):
    from backend.app.api import workspace

    monkeypatch.setattr(svc, "reconstruct_epic",
                        lambda epic_id, base, token, pid: {"epic_id": epic_id, "epic_title": "Auth", "results": []})
    out = workspace.import_reconstruct_epic(epic_id=10, ctx=_CTX, x_taiga_url="")
    assert out["epic_id"] == 10


def test_route_reconstruct_failure_is_502(ctx, monkeypatch):
    from backend.app.api import workspace

    def boom(*a, **k):
        raise RuntimeError("AI failed")
    monkeypatch.setattr(svc, "reconstruct_epic", boom)

    with pytest.raises(HTTPException) as ei:
        workspace.import_reconstruct_epic(epic_id=10, ctx=_CTX, x_taiga_url="")
    assert ei.value.status_code == 502
