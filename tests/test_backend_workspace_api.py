"""API route tests for migrated workspace FastAPI routes."""

import pytest
from fastapi import HTTPException

from backend.app.api.deps import AuthContext
from backend.app.api.workspace import (
    get_config,
    get_story_phase_status,
    rebuild_story_index,
    remove_epic_from_story_index,
    remove_story_from_story_index,
    reset_context_file,
    save_ai_config_endpoint,
    save_config,
    set_story_phase_status,
    story_index_stats,
    update_context_file,
)
from backend.app.schemas.workspace import (
    SaveAiConfigRequest,
    SaveConfigRequest,
    SetPhaseStatusRequest,
    UpdateContextFileRequest,
)
from backend.app.services.request_context import RequestContext

_AUTH = AuthContext(pm_token="tok")


def test_story_index_stats_deployed_counts_only_explicit_deployed(monkeypatch):
    def set_active_project(project_id: int) -> None:
        assert project_id == 42

    monkeypatch.setattr("src.context_manager.set_active_project", set_active_project)
    monkeypatch.setattr(
        "src.context_manager.get_story_index",
        lambda: {
            "1": {"has_tech_spec": True, "has_proposal": True, "has_bdd": True, "phase_status": "qa"},
            "2": {"has_tech_spec": True, "has_proposal": False, "has_bdd": False, "phase_status": "deployed"},
        },
    )

    stats = story_index_stats(RequestContext(pm_token="tok", project_id=42))

    assert stats == {
        "total": 2,
        "phase2_designed": 2,
        "phase3_proposed": 1,
        "phase4_tested": 1,
        "phase4_passed": 1,
        "phase5_deployed": 1,
        "spec_drift": 0,
        "drifted_story_ids": [],
    }


def test_remove_epic_from_story_index_uses_request_project(monkeypatch):
    calls: list[tuple[str, int]] = []

    def set_active_project(project_id: int) -> None:
        calls.append(("project", project_id))

    def remove_epic(epic_id: int) -> None:
        calls.append(("epic", epic_id))

    monkeypatch.setattr("src.context_manager.set_active_project", set_active_project)
    monkeypatch.setattr("src.context_manager.remove_epic_from_story_index", remove_epic)

    response = remove_epic_from_story_index(7, RequestContext(pm_token="tok", project_id=42))

    assert response == {"ok": True}
    assert calls == [("project", 42), ("epic", 7)]


def test_remove_story_from_story_index_uses_request_project(monkeypatch):
    calls: list[tuple[str, int | list[int]]] = []

    def set_active_project(project_id: int) -> None:
        calls.append(("project", project_id))

    def remove_stories(story_ids: list[int]) -> None:
        calls.append(("stories", story_ids))

    monkeypatch.setattr("src.context_manager.set_active_project", set_active_project)
    monkeypatch.setattr("src.context_manager.remove_story_index_entries", remove_stories)

    response = remove_story_from_story_index(11, RequestContext(pm_token="tok", project_id=42))

    assert response == {"ok": True}
    assert calls == [("project", 42), ("stories", [11])]


def test_get_story_phase_status_returns_entry_status(monkeypatch):
    monkeypatch.setattr("src.context_manager.set_active_project", lambda pid: None)
    monkeypatch.setattr("src.context_manager.get_story_index", lambda: {"5": {"phase_status": "qa"}})
    res = get_story_phase_status(5, RequestContext(pm_token="tok", project_id=42))
    assert res == {"phase_status": "qa"}


def test_get_story_phase_status_null_when_absent(monkeypatch):
    monkeypatch.setattr("src.context_manager.set_active_project", lambda pid: None)
    monkeypatch.setattr("src.context_manager.get_story_index", lambda: {})
    res = get_story_phase_status(9, RequestContext(pm_token="tok", project_id=42))
    assert res == {"phase_status": None}


def test_set_story_phase_status_upserts_when_in_index(monkeypatch):
    calls: list[tuple[int, dict]] = []
    monkeypatch.setattr("src.context_manager.set_active_project", lambda pid: None)
    monkeypatch.setattr("src.context_manager.get_story_index", lambda: {"5": {"phase_status": "implementation"}})
    monkeypatch.setattr("src.context_manager.upsert_story_index", lambda sid, **kw: calls.append((sid, kw)))
    res = set_story_phase_status(5, SetPhaseStatusRequest(phase_status="qa"), RequestContext(pm_token="tok", project_id=42))
    assert res == {"ok": True}
    assert calls == [(5, {"phase_status": "qa"})]


def test_set_story_phase_status_404_when_not_in_index(monkeypatch):
    monkeypatch.setattr("src.context_manager.set_active_project", lambda pid: None)
    monkeypatch.setattr("src.context_manager.get_story_index", lambda: {})
    monkeypatch.setattr("src.context_manager.upsert_story_index", lambda *a, **k: pytest.fail("should not upsert"))
    with pytest.raises(HTTPException) as ei:
        set_story_phase_status(9, SetPhaseStatusRequest(phase_status="qa"), RequestContext(pm_token="tok", project_id=42))
    assert ei.value.status_code == 404


# ── get_config ──────────────────────────────────────────────────────────────


def test_get_config_taiga_uses_taiga_web_url(monkeypatch):
    monkeypatch.setattr(
        "src.context_manager.load_config",
        lambda: {"project_id": 42, "pm_tool": "taiga", "github_repo": "owner/repo"},
    )
    monkeypatch.setattr("src.taiga_adapter.get_web_base_url", lambda: "https://taiga.example")
    # github_repo is per-instance now — stub the instance lookup (decouples from disk).
    monkeypatch.setattr("src.context_manager.get_instance_github_repo", lambda: "owner/repo")

    response = get_config(_AUTH)

    assert response == {
        "project_id": 42,
        "taiga_web_url": "https://taiga.example",
        "pm_tool": "taiga",
        "pm_web_url": "https://taiga.example",
        "github_repo": "owner/repo",
    }


def test_get_config_jira_uses_jira_web_url(monkeypatch):
    monkeypatch.setattr(
        "src.context_manager.load_config",
        lambda: {"project_id": 7, "pm_tool": "jira", "jira_base_url": "https://acme.atlassian.net"},
    )
    monkeypatch.setattr(
        "src.jira_adapter.get_web_base_url", lambda base: f"{base}/jira/software"
    )

    response = get_config(_AUTH)

    assert response["pm_tool"] == "jira"
    assert response["pm_web_url"] == "https://acme.atlassian.net/jira/software"
    assert response["taiga_web_url"] == "https://acme.atlassian.net/jira/software"


# ── save_ai_config ──────────────────────────────────────────────────────────


def test_save_ai_config_persists_valid_model(monkeypatch):
    saved: list[str] = []
    monkeypatch.setattr(
        "src.ai_engine.AVAILABLE_MODELS",
        [{"id": "claude-fable-5", "label": "Fable 5"}],
    )
    monkeypatch.setattr("src.context_manager.save_ai_config", lambda model: saved.append(model))
    monkeypatch.setattr("src.ai_engine._llm_cache", {"stale": object()})

    response = save_ai_config_endpoint(SaveAiConfigRequest(model="claude-fable-5"), _AUTH)

    assert response["model"] == "claude-fable-5"
    assert saved == ["claude-fable-5"]


def test_save_ai_config_rejects_unknown_model(monkeypatch):
    monkeypatch.setattr(
        "src.ai_engine.AVAILABLE_MODELS",
        [{"id": "claude-fable-5", "label": "Fable 5"}],
    )

    with pytest.raises(HTTPException) as exc_info:
        save_ai_config_endpoint(SaveAiConfigRequest(model="gpt-nonexistent"), _AUTH)

    assert exc_info.value.status_code == 400


# ── save_config ─────────────────────────────────────────────────────────────


def test_save_config_persists_project_and_per_instance_github(monkeypatch):
    calls: list[tuple] = []
    monkeypatch.setattr("src.context_manager.save_config", lambda pid: calls.append(("project", pid)))
    # github_repo is now saved per-instance (not the legacy global save_github_config).
    monkeypatch.setattr(
        "src.context_manager.save_instance_github_repo", lambda repo: calls.append(("github", repo))
    )

    response = save_config(
        SaveConfigRequest(project_id=42, github_repo="owner/repo"), _AUTH
    )

    assert response == {"ok": True}
    assert calls == [("project", 42), ("github", "owner/repo")]


def test_save_config_validates_jira_base_url_against_ssrf(monkeypatch):
    validated: list[str] = []
    monkeypatch.setattr(
        "backend.app.api.jira_proxy.validate_jira_base_url",
        lambda url, source: validated.append(url),
    )
    monkeypatch.setattr(
        "src.context_manager.save_pm_config",
        lambda *, pm_tool, jira_base_url, taiga_url: None,
    )

    response = save_config(
        SaveConfigRequest(pm_tool="jira", jira_base_url="https://acme.atlassian.net"), _AUTH
    )

    assert response == {"ok": True}
    assert validated == ["https://acme.atlassian.net"]


def test_save_config_validates_and_saves_taiga_url(monkeypatch):
    validated: list[str] = []
    saved: list[tuple[str | None, str | None, str | None]] = []
    monkeypatch.setattr(
        "backend.app.api.taiga_proxy._validate_taiga_url",
        lambda url, source: validated.append(url),
    )
    monkeypatch.setattr(
        "src.context_manager.save_pm_config",
        lambda *, pm_tool, jira_base_url, taiga_url: saved.append((pm_tool, jira_base_url, taiga_url)),
    )

    response = save_config(
        SaveConfigRequest(pm_tool="taiga", taiga_url="https://private.example.org/api/v1", jira_base_url=""),
        _AUTH,
    )

    assert response == {"ok": True}
    assert validated == ["https://private.example.org/api/v1"]
    assert saved == [("taiga", "", "https://private.example.org/api/v1")]


# ── context-file routes: unknown filename guard ───────────────────────────────


def test_update_context_file_rejects_unknown_filename():
    with pytest.raises(HTTPException) as exc_info:
        update_context_file(
            "../../etc/passwd",
            UpdateContextFileRequest(content="x"),
            RequestContext(pm_token="tok", project_id=42),
        )

    assert exc_info.value.status_code == 404


def test_reset_context_file_rejects_unknown_filename():
    with pytest.raises(HTTPException) as exc_info:
        reset_context_file("unknown.md", RequestContext(pm_token="tok", project_id=42))

    assert exc_info.value.status_code == 404


# --- Controlled spec co-evolution (roadmap #4) -----------------------------

def test_update_context_file_returns_drift_on_post_lock_edit(ctx):
    ctx.upsert_story_index(1, phase_status="implementation")
    resp = update_context_file(
        "technical-spec.md",
        UpdateContextFileRequest(content="# edited spec", note="tighten auth"),
        RequestContext(pm_token="tok", project_id=ctx._get_project_id()),
    )
    assert resp["drift"]["amended"] is True
    assert resp["drift"]["affected_story_ids"] == [1]
    assert ctx.get_story_index()["1"]["spec_drift"] is True


def test_update_context_file_no_drift_pre_lock(ctx):
    ctx.upsert_story_index(1, phase_status="gherkin_locked")
    resp = update_context_file(
        "design-bundle.md",
        UpdateContextFileRequest(content="# edited"),
        RequestContext(pm_token="tok", project_id=ctx._get_project_id()),
    )
    assert resp.get("drift") is None


def test_acknowledge_drift_clears_flag(ctx):
    from backend.app.api.workspace import acknowledge_spec_drift, get_amendments
    ctx.upsert_story_index(1, phase_status="implementation")
    ctx.amend_locked_spec("technical-spec.md", note="x")
    rc = RequestContext(pm_token="tok", project_id=ctx._get_project_id())
    assert acknowledge_spec_drift(1, rc) == {"ok": True}
    assert ctx.get_story_index()["1"]["spec_drift"] is False
    # amendment log still readable
    assert "technical-spec.md" in get_amendments(rc)["amendments_md"]


def test_stats_lists_drifted_story_ids(ctx):
    ctx.upsert_story_index(1, phase_status="implementation")
    ctx.upsert_story_index(2, phase_status="qa")
    ctx.upsert_story_index(3, phase_status="gherkin_locked")  # pre-lock, not flagged
    ctx.amend_locked_spec("technical-spec.md")  # flags 1 and 2 (design_locked+)
    stats = story_index_stats(RequestContext(pm_token="tok", project_id=ctx._get_project_id()))
    assert stats["spec_drift"] == 2
    assert stats["drifted_story_ids"] == [1, 2]


# ── rebuild_story_index ───────────────────────────────────────────────────────


def test_rebuild_story_index_uses_request_project(monkeypatch):
    calls: list[tuple] = []
    monkeypatch.setattr(
        "src.context_manager.set_active_project", lambda pid: calls.append(("project", pid))
    )
    monkeypatch.setattr(
        "src.context_manager.rebuild_story_index", lambda: calls.append(("rebuild",))
    )

    response = rebuild_story_index(RequestContext(pm_token="tok", project_id=42))

    assert response == {"ok": True}
    assert calls == [("project", 42), ("rebuild",)]


def test_rebuild_story_index_maps_failure_to_500(monkeypatch):
    monkeypatch.setattr("src.context_manager.set_active_project", lambda pid: None)

    def boom() -> None:
        raise RuntimeError("disk gone")

    monkeypatch.setattr("src.context_manager.rebuild_story_index", boom)

    with pytest.raises(HTTPException) as exc_info:
        rebuild_story_index(RequestContext(pm_token="tok", project_id=42))

    assert exc_info.value.status_code == 500
