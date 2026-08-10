"""Tests for the Taiga import (Option C onboarding) service + routes.

Covers the pure helpers (status mapping, epic-id extraction), pagination,
the no-AI bootstrap, the per-epic Gherkin reconstruction, and the two API
routes (happy path + 502 on Taiga failure).
"""

from unittest.mock import patch

import pytest
from fastapi import HTTPException

from backend.app.services import import_service as svc
from backend.app.services.context_service import ContextService
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
# _map_plane_status — Plane's literal 5-value state.group enum → phase_status
# (phase 4a, see plane_integration_plan memory)
# ---------------------------------------------------------------------------

def test_map_plane_status_completed_is_deployed():
    assert svc._map_plane_status({"group": "completed"}) == "deployed"


def test_map_plane_status_cancelled_is_also_deployed():
    # Mirrors _map_taiga_status's is_closed -> deployed treatment.
    assert svc._map_plane_status({"group": "cancelled"}) == "deployed"


def test_map_plane_status_started_is_implementation():
    assert svc._map_plane_status({"group": "started"}) == "implementation"


@pytest.mark.parametrize("group", ["backlog", "unstarted"])
def test_map_plane_status_not_started_defaults_gherkin_locked(group):
    assert svc._map_plane_status({"group": group}) == "gherkin_locked"


def test_map_plane_status_unknown_group_defaults_gherkin_locked():
    # No 6th group exists (literal-confirmed 5-value enum), but stay
    # defensive against an unrecognised value rather than crashing.
    assert svc._map_plane_status({"group": "something-new"}) == "gherkin_locked"


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


def test_format_reconstruction_story_input_preserves_structured_pm_spec():
    raw = {
        "description": (
            "## Apex Requirement Spec\n\n"
            "### Acceptance Criteria (Gherkin)\n"
            "```gherkin\nFeature: Login\n```\n\n"
            "### Clarifications\n- **Q:** MFA?\n  **A:** Required"
        )
    }

    text = svc._format_reconstruction_story_input(100, "Login", raw)

    assert "## PM Story" in text
    assert "### Existing PM Description" in text
    assert "## Apex Requirement Spec" in text
    assert "### Clarifications" in text
    assert "functional-spec.md" in text


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
# _plane_get_all — pagination via deps._pm_get_json (phase 4a)
# ---------------------------------------------------------------------------

def test_plane_paginate_follows_next_page_results_not_next_cursor(monkeypatch):
    # Same bug class already found+fixed in plane-direct.ts (phase 2): Plane
    # always returns a non-null next_cursor, even on the last page —
    # next_page_results is the real continuation signal.
    from backend.app.api import deps
    pages = [
        {"results": [{"id": "a"}], "next_cursor": "cur2", "next_page_results": True},
        {"results": [{"id": "b"}], "next_cursor": "still-non-null", "next_page_results": False},
    ]
    calls = []

    def fake_get(url, pm_tool, token):
        calls.append(url)
        return pages.pop(0)

    monkeypatch.setattr(deps, "_pm_get_json", fake_get)
    out = svc._plane_get_all("https://api.plane.so/api/v1", "tok", "workspaces/w/projects/p/states/")

    assert out == [{"id": "a"}, {"id": "b"}]
    assert len(calls) == 2
    assert "cursor=cur2" in calls[1]


def test_plane_paginate_stops_on_empty_body(monkeypatch):
    from backend.app.api import deps
    monkeypatch.setattr(deps, "_pm_get_json", lambda url, pm_tool, token: None)
    out = svc._plane_get_all("https://api.plane.so/api/v1", "tok", "workspaces/w/projects/p/states/")
    assert out == []


def test_plane_paginate_honours_max_pages_cap(monkeypatch):
    from backend.app.api import deps
    monkeypatch.setattr(
        deps, "_pm_get_json",
        lambda url, pm_tool, token: {"results": [{"id": "x"}], "next_cursor": "always-non-null", "next_page_results": True},
    )
    out = svc._plane_get_all("https://api.plane.so/api/v1", "tok", "workspaces/w/projects/p/states/")
    assert len(out) == svc._PLANE_MAX_PAGES


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

    report = svc.bootstrap("https://api.taiga.io/api/v1", "tok", 42, ContextService())

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


def test_bootstrap_uses_configured_status_mapping(ctx, monkeypatch):
    # bootstrap() now reads the status mapping through ContextService, which is
    # scoped to the active project ContextVar — set it to match the literal
    # project_id (42) used below, mirroring what the router does via set_active().
    ctx._active_project_id.set(42)
    ctx.save_project_status_mapping({"2": "qa_passed"}, 42)
    _wire_taiga(
        monkeypatch,
        statuses=[{"id": 2, "name": "In progress"}],
        epics=[],
        stories=[{"id": 100, "subject": "Login", "status": 2, "epic": None}],
    )

    report = svc.bootstrap("https://api.taiga.io/api/v1", "tok", 42, ContextService())

    assert ctx.get_story_index()["100"]["phase_status"] == "qa_passed"
    assert report["status_mapping"] == [{"pm_status_name": "In progress", "apex_status": "qa_passed", "source": "configured"}]


def test_bootstrap_skips_existing_and_is_idempotent(ctx, monkeypatch):
    args = dict(
        statuses=[{"id": 1, "name": "New"}],
        epics=[{"id": 10, "subject": "Auth"}],
        stories=[{"id": 100, "subject": "Login", "status": 1, "epic": 10}],
    )
    _wire_taiga(monkeypatch, **args)

    first = svc.bootstrap("https://api.taiga.io/api/v1", "tok", 42, ContextService())
    assert first["imported"] == 1 and first["skipped"] == 0

    # Re-run: the story is already in the index → skipped, nothing re-imported.
    second = svc.bootstrap("https://api.taiga.io/api/v1", "tok", 42, ContextService())
    assert second["imported"] == 0 and second["skipped"] == 1


def test_bootstrap_unmapped_status_id_defaults_gherkin_locked(ctx, monkeypatch):
    _wire_taiga(
        monkeypatch,
        statuses=[{"id": 1, "name": "In progress"}],
        epics=[],
        stories=[{"id": 100, "subject": "S", "status": 999, "epic": None}],  # status id not in map
    )
    svc.bootstrap("https://api.taiga.io/api/v1", "tok", 42, ContextService())
    assert ctx.get_story_index()["100"]["phase_status"] == "gherkin_locked"


# ---------------------------------------------------------------------------
# plane_bootstrap — Plane counterpart, board data comes from the caller
# (phase 4c, see plane_integration_plan memory)
# ---------------------------------------------------------------------------

def _fake_plane_states(monkeypatch, states):
    from backend.app.api import deps

    def fake_get(url, pm_tool, token):
        return {"results": states, "next_cursor": None, "next_page_results": False}

    monkeypatch.setattr(deps, "_pm_get_json", fake_get)


def test_plane_bootstrap_imports_and_maps_status(ctx, monkeypatch):
    _fake_plane_states(monkeypatch, [
        {"id": "st1", "name": "Backlog", "group": "backlog"},
        {"id": "st2", "name": "In Progress", "group": "started"},
        {"id": "st3", "name": "Done", "group": "completed"},
    ])
    epics = [{
        "pm_epic_id": "epic-uuid-1",
        "subject": "Auth",
        "stories": [
            {"pm_story_id": "story-uuid-1", "subject": "Login", "status": "st2"},
            {"pm_story_id": "story-uuid-2", "subject": "Logout", "status": "st3"},
        ],
    }]

    report = svc.plane_bootstrap("https://api.plane.so/api/v1", "tok", "my-team", "proj-uuid", epics, ContextService())

    assert report["imported"] == 2
    assert report["skipped"] == 0

    index = ctx.get_story_index()
    minted_epic = ctx.mint_pm_id("epic-uuid-1")
    story1_id = ctx.mint_pm_id("story-uuid-1")
    story2_id = ctx.mint_pm_id("story-uuid-2")
    assert index[str(story1_id)]["phase_status"] == "implementation"
    assert index[str(story1_id)]["epic_id"] == minted_epic
    assert index[str(story2_id)]["phase_status"] == "deployed"

    counts = {e["id"]: e["story_count"] for e in report["epics"]}
    assert counts == {minted_epic: 2}


def test_plane_bootstrap_skips_existing_and_is_idempotent(ctx, monkeypatch):
    _fake_plane_states(monkeypatch, [{"id": "st1", "name": "Backlog", "group": "backlog"}])
    epics = [{
        "pm_epic_id": "epic-uuid-1", "subject": "Auth",
        "stories": [{"pm_story_id": "story-uuid-1", "subject": "Login", "status": "st1"}],
    }]

    first = svc.plane_bootstrap("https://api.plane.so/api/v1", "tok", "my-team", "proj-uuid", epics, ContextService())
    assert first["imported"] == 1 and first["skipped"] == 0

    # Re-run with the SAME real Plane ids: mint_pm_id resolves to the same
    # Apex ids, already in the index → skipped, nothing duplicated.
    second = svc.plane_bootstrap("https://api.plane.so/api/v1", "tok", "my-team", "proj-uuid", epics, ContextService())
    assert second["imported"] == 0 and second["skipped"] == 1


def test_plane_bootstrap_uses_configured_status_mapping(ctx, monkeypatch):
    ctx.save_project_status_mapping({"st1": "qa_passed"})
    _fake_plane_states(monkeypatch, [{"id": "st1", "name": "Backlog", "group": "backlog"}])
    epics = [{
        "pm_epic_id": "epic-uuid-1", "subject": "Auth",
        "stories": [{"pm_story_id": "story-uuid-1", "subject": "Login", "status": "st1"}],
    }]

    report = svc.plane_bootstrap("https://api.plane.so/api/v1", "tok", "my-team", "proj-uuid", epics, ContextService())

    story1_id = ctx.mint_pm_id("story-uuid-1")
    assert ctx.get_story_index()[str(story1_id)]["phase_status"] == "qa_passed"
    assert report["status_mapping"] == [{"pm_status_name": "Backlog", "apex_status": "qa_passed", "source": "configured"}]


def test_plane_bootstrap_ignores_entries_without_pm_ids(ctx, monkeypatch):
    _fake_plane_states(monkeypatch, [])
    epics = [
        {"pm_epic_id": "", "subject": "No id epic", "stories": []},
        {"pm_epic_id": "epic-uuid-1", "subject": "Auth", "stories": [{"pm_story_id": "", "subject": "No id story", "status": None}]},
    ]
    report = svc.plane_bootstrap("https://api.plane.so/api/v1", "tok", "my-team", "proj-uuid", epics, ContextService())
    assert report["imported"] == 0
    assert report["epics"] == []


def test_plane_bootstrap_unmapped_status_defaults_gherkin_locked(ctx, monkeypatch):
    _fake_plane_states(monkeypatch, [])  # no states known at all
    epics = [{
        "pm_epic_id": "epic-uuid-1", "subject": "Auth",
        "stories": [{"pm_story_id": "story-uuid-1", "subject": "Login", "status": "unknown-state"}],
    }]
    svc.plane_bootstrap("https://api.plane.so/api/v1", "tok", "my-team", "proj-uuid", epics, ContextService())
    story1_id = ctx.mint_pm_id("story-uuid-1")
    assert ctx.get_story_index()[str(story1_id)]["phase_status"] == "gherkin_locked"


# ---------------------------------------------------------------------------
# reconstruct_epic — Step 2, AI per epic
# ---------------------------------------------------------------------------

def test_reconstruct_empty_epic_returns_empty(ctx, monkeypatch):
    monkeypatch.setattr(svc, "_taiga_get_all", lambda *a, **k: [])
    out = svc.reconstruct_epic(10, "https://api.taiga.io/api/v1", "tok", 42, ContextService())
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
    captured = {}
    def fake_ai(title, items):
        captured["items"] = items
        return {100: "Feature: Login\n  Scenario: ok", 101: "   "}
    monkeypatch.setattr("src.ai_engine.reconstruct_gherkin_batch", fake_ai)

    out = svc.reconstruct_epic(10, "https://api.taiga.io/api/v1", "tok", 42, ContextService())

    by_id = {r["story_id"]: r for r in out["results"]}
    assert by_id[100]["status"] == "ok"
    assert by_id[101]["status"] == "skipped"
    assert captured["items"][0]["description"].startswith("## PM Story")
    assert "### Existing PM Description" in captured["items"][0]["description"]
    assert "user logs in" in captured["items"][0]["description"]
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

    out = svc.reconstruct_epic(svc._GENERAL_EPIC_ID, "https://api.taiga.io/api/v1", "tok", 42, ContextService())

    assert out["epic_title"] == svc._GENERAL_EPIC_TITLE
    assert captured["ids"] == [102]   # only the index entry, story 200 not in this epic
    assert out["results"][0]["status"] == "ok"


# ---------------------------------------------------------------------------
# reconstruct_epic — Plane path (phase 5c): story_descriptions supplied
# ---------------------------------------------------------------------------

def test_reconstruct_plane_uses_supplied_descriptions_skips_taiga(ctx, monkeypatch):
    ctx.upsert_story_index(500, title="Login", epic_id=10, epic_title="Auth",
                           phase_status="gherkin_locked", has_gherkin=False)
    ctx.upsert_story_index(501, title="Logout", epic_id=10, epic_title="Auth",
                           phase_status="gherkin_locked", has_gherkin=False)

    def boom(*a, **k):
        raise AssertionError("Taiga must not be dialed when story_descriptions is supplied")
    monkeypatch.setattr(svc, "_taiga_get_all", boom)

    captured = {}
    def fake_ai(title, items):
        captured["items"] = items
        return {500: "Feature: Login\n  Scenario: ok", 501: "Feature: Logout\n  Scenario: ok"}
    monkeypatch.setattr("src.ai_engine.reconstruct_gherkin_batch", fake_ai)

    story_descriptions = {500: "plane description for login", 501: "plane description for logout"}
    out = svc.reconstruct_epic(
        10, "", "tok", 0, ContextService(), story_descriptions=story_descriptions,
    )

    by_id = {r["story_id"]: r for r in out["results"]}
    assert by_id[500]["status"] == "ok"
    assert by_id[501]["status"] == "ok"
    assert out["epic_id"] == 10
    assert out["epic_title"] == "Auth"

    items_by_id = {i["id"]: i for i in captured["items"]}
    assert items_by_id[500]["description"] == "plane description for login"
    assert items_by_id[501]["description"] == "plane description for logout"

    # Written downstream identically to the Taiga path.
    assert ctx.get_story_index()["500"]["has_gherkin"] is True
    assert ctx.get_story_index()["501"]["has_gherkin"] is True


def test_reconstruct_plane_missing_description_falls_back_to_formatted_input(ctx, monkeypatch):
    ctx.upsert_story_index(600, title="Signup", epic_id=20, epic_title="Onboarding",
                           phase_status="gherkin_locked", has_gherkin=False)
    ctx.upsert_story_index(601, title="Verify email", epic_id=20, epic_title="Onboarding",
                           phase_status="gherkin_locked", has_gherkin=False)

    def boom(*a, **k):
        raise AssertionError("Taiga must not be dialed when story_descriptions is supplied")
    monkeypatch.setattr(svc, "_taiga_get_all", boom)

    captured = {}
    def fake_ai(title, items):
        captured["items"] = items
        return {600: "Feature: Signup", 601: "Feature: Verify"}
    monkeypatch.setattr("src.ai_engine.reconstruct_gherkin_batch", fake_ai)

    # 601 has no entry in story_descriptions — must still get an AI-input
    # entry via the _format_reconstruction_story_input fallback, not be
    # skipped/crashed.
    story_descriptions = {600: "explicit plane description"}
    out = svc.reconstruct_epic(
        20, "", "tok", 0, ContextService(), story_descriptions=story_descriptions,
    )

    assert {r["story_id"] for r in out["results"]} == {600, 601}
    assert all(r["status"] == "ok" for r in out["results"])

    items_by_id = {i["id"]: i for i in captured["items"]}
    assert items_by_id[600]["description"] == "explicit plane description"
    fallback_expected = svc._format_reconstruction_story_input(601, "Verify email", {})
    assert items_by_id[601]["description"] == fallback_expected


def test_reconstruct_none_story_descriptions_still_dials_taiga(ctx, monkeypatch):
    """Regression guard: story_descriptions=None (default) preserves the
    original Taiga self-dial behavior, unchanged by the phase 5c refactor."""
    ctx.upsert_story_index(700, title="Login", epic_id=10, epic_title="Auth",
                           phase_status="gherkin_locked", has_gherkin=False)

    called = {}
    def fake_get_all(url, token, params=None):
        called["url"] = url
        called["params"] = params
        return [{"id": 700, "subject": "Login", "description": "taiga desc"}]
    monkeypatch.setattr(svc, "_taiga_get_all", fake_get_all)

    def fake_ai(title, items):
        return {700: "Feature: Login\n  Scenario: ok"}
    monkeypatch.setattr("src.ai_engine.reconstruct_gherkin_batch", fake_ai)

    out = svc.reconstruct_epic(10, "https://api.taiga.io/api/v1", "tok", 42, ContextService())

    assert called["url"] == "https://api.taiga.io/api/v1/userstories"
    assert called["params"] == {"project": 42, "epic": 10}
    assert out["results"][0]["status"] == "ok"
    assert ctx.get_story_index()["700"]["has_gherkin"] is True


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

_CTX = RequestContext(pm_token="tok", project_id=42)


def test_route_bootstrap_happy(ctx, monkeypatch):
    from backend.app.api import workspace

    # The route imports import_service lazily, so it's the same module object as svc.
    monkeypatch.setattr(svc, "bootstrap",
                        lambda base, token, pid, context: {"imported": 1, "skipped": 0, "epics": [], "status_mapping": []})

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


_PLANE_CTX = RequestContext(pm_token="tok", project_id="f722d8f5-57a4-4c98-8651-f7e89970c359", instance_id="api_plane_so")


def test_route_plane_bootstrap_happy(ctx, monkeypatch):
    from backend.app.api import workspace

    monkeypatch.setattr(
        svc, "plane_bootstrap",
        lambda base, token, slug, pid, epics, context: {"imported": 1, "skipped": 0, "epics": [], "status_mapping": []},
    )
    monkeypatch.setattr(workspace, "resolve_plane_base", lambda x_plane_url="": "https://api.plane.so/api/v1")

    payload = workspace.PlaneImportBootstrapRequest(epics=[
        {"pm_epic_id": "epic-uuid-1", "subject": "Auth", "stories": []},
    ])
    out = workspace.import_from_pm_plane_bootstrap(
        payload, ctx=_PLANE_CTX, x_plane_url="https://api.plane.so", x_plane_workspace="my-team",
    )
    assert out["imported"] == 1


def test_route_plane_bootstrap_requires_workspace(ctx, monkeypatch):
    from backend.app.api import workspace

    payload = workspace.PlaneImportBootstrapRequest(epics=[])
    with pytest.raises(HTTPException) as exc:
        workspace.import_from_pm_plane_bootstrap(
            payload, ctx=_PLANE_CTX, x_plane_url="https://api.plane.so", x_plane_workspace="",
        )
    assert exc.value.status_code == 400


def test_route_plane_bootstrap_rejects_malformed_workspace_slug(ctx, monkeypatch):
    from backend.app.api import workspace

    payload = workspace.PlaneImportBootstrapRequest(epics=[])
    with pytest.raises(HTTPException) as exc:
        workspace.import_from_pm_plane_bootstrap(
            payload, ctx=_PLANE_CTX, x_plane_url="https://api.plane.so", x_plane_workspace="../evil",
        )
    assert exc.value.status_code == 400


def test_route_plane_bootstrap_failure_is_502(ctx, monkeypatch):
    from backend.app.api import workspace

    def boom(*a, **k):
        raise RuntimeError("plane down")
    monkeypatch.setattr(svc, "plane_bootstrap", boom)
    monkeypatch.setattr(workspace, "resolve_plane_base", lambda x_plane_url="": "https://api.plane.so/api/v1")

    payload = workspace.PlaneImportBootstrapRequest(epics=[])
    with pytest.raises(HTTPException) as exc:
        workspace.import_from_pm_plane_bootstrap(
            payload, ctx=_PLANE_CTX, x_plane_url="https://api.plane.so", x_plane_workspace="my-team",
        )
    assert exc.value.status_code == 502


def test_route_reconstruct_happy(ctx, monkeypatch):
    from backend.app.api import workspace

    monkeypatch.setattr(svc, "reconstruct_epic",
                        lambda epic_id, base, token, pid, context: {"epic_id": epic_id, "epic_title": "Auth", "results": []})
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


# ---------------------------------------------------------------------------
# import_reconstruct_epic route — Plane branch (phase 5c)
# ---------------------------------------------------------------------------

def test_route_reconstruct_plane_branch_mints_ids_and_skips_taiga(ctx, monkeypatch):
    """pm_tool=plane: the route must mint Apex ids from the payload's real
    UUIDs via context.mint_pm_id, key story_descriptions by those minted
    ints, and never touch the Taiga dial path at all."""
    from backend.app.api import workspace

    minted = {}
    def fake_mint(self, pm_story_id):
        apex_id = {"story-uuid-1": 501, "story-uuid-2": 502}[pm_story_id]
        minted[pm_story_id] = apex_id
        return apex_id
    monkeypatch.setattr(workspace.ContextService, "mint_pm_id", fake_mint)

    captured = {}
    def fake_reconstruct(epic_id, taiga_base, token, project_id, context, *, story_descriptions=None):
        captured.update(epic_id=epic_id, taiga_base=taiga_base, project_id=project_id,
                        story_descriptions=story_descriptions)
        return {"epic_id": epic_id, "epic_title": "Auth", "results": []}
    monkeypatch.setattr(svc, "reconstruct_epic", fake_reconstruct)

    def boom(*a, **k):
        raise AssertionError("Taiga must not be dialed on the Plane reconstruct path")
    monkeypatch.setattr(workspace, "resolve_taiga_base", boom)
    monkeypatch.setattr(svc, "_taiga_get_all", boom)

    payload = workspace.ImportReconstructRequest(stories=[
        {"pm_story_id": "story-uuid-1", "description": "desc one"},
        {"pm_story_id": "story-uuid-2", "description": "desc two"},
    ])

    with patch("src.context_manager.load_config", return_value={"pm_tool": "plane"}):
        out = workspace.import_reconstruct_epic(
            epic_id=10, payload=payload, ctx=_PLANE_CTX, x_taiga_url="",
        )

    assert minted == {"story-uuid-1": 501, "story-uuid-2": 502}
    assert captured["story_descriptions"] == {501: "desc one", 502: "desc two"}
    assert captured["taiga_base"] == ""
    assert captured["project_id"] == 0
    assert out["epic_id"] == 10


def test_route_reconstruct_plane_branch_ignores_stories_without_pm_id(ctx, monkeypatch):
    from backend.app.api import workspace

    monkeypatch.setattr(workspace.ContextService, "mint_pm_id", lambda self, pm_story_id: 501)

    captured = {}
    def fake_reconstruct(epic_id, taiga_base, token, project_id, context, *, story_descriptions=None):
        captured["story_descriptions"] = story_descriptions
        return {"epic_id": epic_id, "epic_title": "Auth", "results": []}
    monkeypatch.setattr(svc, "reconstruct_epic", fake_reconstruct)

    payload = workspace.ImportReconstructRequest(stories=[
        {"pm_story_id": "", "description": "no id, should be skipped"},
    ])

    with patch("src.context_manager.load_config", return_value={"pm_tool": "plane"}):
        workspace.import_reconstruct_epic(epic_id=10, payload=payload, ctx=_PLANE_CTX, x_taiga_url="")

    assert captured["story_descriptions"] == {}


def test_route_reconstruct_taiga_branch_unaffected_no_payload(ctx, monkeypatch):
    """Regression check: payload omitted (as every pre-Plane caller did) and
    pm_tool defaults/reads as taiga — byte-for-byte the pre-5c behavior."""
    from backend.app.api import workspace

    captured = {}
    def fake_reconstruct(epic_id, taiga_base, token, project_id, context):
        captured.update(epic_id=epic_id, taiga_base=taiga_base, project_id=project_id)
        return {"epic_id": epic_id, "epic_title": "Auth", "results": []}
    monkeypatch.setattr(svc, "reconstruct_epic", fake_reconstruct)
    monkeypatch.setattr(workspace, "resolve_taiga_base", lambda x_taiga_url="": "https://api.taiga.io/api/v1")

    with patch("src.context_manager.load_config", return_value={"pm_tool": "taiga"}):
        out = workspace.import_reconstruct_epic(epic_id=10, ctx=_CTX, x_taiga_url="")

    assert captured["taiga_base"] == "https://api.taiga.io/api/v1"
    assert captured["project_id"] == 42
    assert out["epic_id"] == 10


def test_route_reconstruct_taiga_branch_default_pm_tool_when_config_missing(ctx, monkeypatch):
    """pm_tool absent from saved config (the common pre-Plane case) must
    still hit the Taiga branch — the route defaults to 'taiga'."""
    from backend.app.api import workspace

    monkeypatch.setattr(
        svc, "reconstruct_epic",
        lambda epic_id, base, token, pid, context: {"epic_id": epic_id, "epic_title": "Auth", "results": []},
    )
    monkeypatch.setattr(workspace, "resolve_taiga_base", lambda x_taiga_url="": "https://api.taiga.io/api/v1")

    with patch("src.context_manager.load_config", return_value={}):
        out = workspace.import_reconstruct_epic(epic_id=10, ctx=_CTX, x_taiga_url="")

    assert out["epic_id"] == 10
