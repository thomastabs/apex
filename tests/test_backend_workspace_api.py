"""API route tests for migrated workspace FastAPI routes."""

from backend.app.api.workspace import (
    remove_epic_from_story_index,
    remove_story_from_story_index,
    story_index_stats,
)
from backend.app.services.request_context import RequestContext


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
