"""API route tests for migrated workspace FastAPI routes."""

import pytest
from fastapi import HTTPException

from backend.app.api.deps import AuthContext
from backend.app.api.workspace import (
    get_config,
    rebuild_story_index,
    remove_epic_from_story_index,
    remove_story_from_story_index,
    reset_context_file,
    save_ai_config_endpoint,
    save_config,
    story_index_stats,
    update_context_file,
)
from backend.app.schemas.workspace import (
    SaveAiConfigRequest,
    SaveConfigRequest,
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


# ── get_config ──────────────────────────────────────────────────────────────


def test_get_config_taiga_uses_taiga_web_url(monkeypatch):
    monkeypatch.setattr(
        "src.context_manager.load_config",
        lambda: {"project_id": 42, "pm_tool": "taiga", "github_repo": "owner/repo"},
    )
    monkeypatch.setattr("src.taiga_adapter.get_web_base_url", lambda: "https://taiga.example")

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


def test_save_config_persists_project_and_github(monkeypatch):
    calls: list[tuple] = []
    monkeypatch.setattr("src.context_manager.save_config", lambda pid: calls.append(("project", pid)))
    monkeypatch.setattr(
        "src.context_manager.save_github_config", lambda repo: calls.append(("github", repo))
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
