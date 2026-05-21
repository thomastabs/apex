"""API route tests for migrated workspace FastAPI routes."""

import pytest
from fastapi import HTTPException

from backend.app.api.workspace import get_board, login, story_index_stats
from backend.app.schemas.workspace import LoginRequest
from backend.app.services.request_context import RequestContext
from src.taiga_adapter import TaigaAPIError


class StubTaigaService:
    def __init__(self, exc: TaigaAPIError | None = None, *, epics: list[dict] | None = None, stories: list[dict] | None = None):
        self.exc = exc
        self.epics = epics or []
        self.stories = stories or []
        self.context: tuple[str, int] | None = None
        self.stories_for_epic_calls: list[int] = []

    def login(self, username: str, password: str) -> str:
        if self.exc:
            raise self.exc
        return "tok"

    def set_context(self, token: str, project_id: int) -> None:
        self.context = (token, project_id)

    def get_me(self) -> dict:
        return {"id": 1, "username": "tester", "full_name": "Test User", "email": "t@example.com"}

    def get_epics(self) -> list[dict]:
        return self.epics

    def get_stories(self) -> list[dict]:
        return self.stories

    def get_stories_for_epic(self, epic_id: int) -> list[dict]:
        self.stories_for_epic_calls.append(epic_id)
        return []


def _patch_service(monkeypatch, exc: TaigaAPIError | None = None, *, service: StubTaigaService | None = None):
    instance = service or StubTaigaService(exc)
    monkeypatch.setattr("backend.app.api.workspace.TaigaService", lambda: instance)
    return instance


def test_login_success(monkeypatch):
    _patch_service(monkeypatch)

    response = login(LoginRequest(username="tester", password="secret"))

    assert response["auth_token"] == "tok"
    assert response["me"]["username"] == "tester"


def test_login_invalid_credentials_maps_to_401(monkeypatch):
    exc = TaigaAPIError("POST", "https://api.taiga.io/api/v1/auth", 401, '{"detail":"No active account found"}')
    _patch_service(monkeypatch, exc)

    with pytest.raises(HTTPException) as raised:
        login(LoginRequest(username="tester", password="wrong"))

    assert raised.value.status_code == 401
    assert raised.value.detail == "No active account found"


def test_login_timeout_maps_to_504(monkeypatch):
    exc = TaigaAPIError("POST", "https://api.taiga.io/api/v1/auth", 0, "Request timed out")
    _patch_service(monkeypatch, exc)

    with pytest.raises(HTTPException) as raised:
        login(LoginRequest(username="tester", password="secret"))

    assert raised.value.status_code == 504
    assert raised.value.detail == "Request timed out"


def test_login_upstream_error_maps_to_502(monkeypatch):
    exc = TaigaAPIError("POST", "https://api.taiga.io/api/v1/auth", 503, "service unavailable")
    _patch_service(monkeypatch, exc)

    with pytest.raises(HTTPException) as raised:
        login(LoginRequest(username="tester", password="secret"))

    assert raised.value.status_code == 502
    assert raised.value.detail == "service unavailable"


def test_board_groups_project_stories_without_per_epic_fetches(monkeypatch):
    service = StubTaigaService(
        epics=[
            {"id": 1, "ref": 1, "subject": "Auth", "description": "", "tags": []},
            {"id": 2, "ref": 2, "subject": "Search", "description": "", "tags": []},
        ],
        stories=[
            {"id": 10, "ref": 10, "subject": "Login", "description": "", "tags": [], "epic_id": 1, "epic_subject": "Auth"},
            {"id": 11, "ref": 11, "subject": "Logout", "description": "", "tags": [], "epic_id": 1, "epic_subject": "Auth"},
            {"id": 20, "ref": 20, "subject": "Find", "description": "", "tags": [], "epic_id": 2, "epic_subject": "Search"},
            {"id": 99, "ref": 99, "subject": "Orphan", "description": "", "tags": [], "epic_id": None, "epic_subject": ""},
        ],
    )
    _patch_service(monkeypatch, service=service)

    board = get_board(RequestContext(taiga_token="tok", project_id=42))

    assert service.context == ("tok", 42)
    assert service.stories_for_epic_calls == []
    assert [story["id"] for story in board[0]["stories"]] == [10, 11]
    assert [story["id"] for story in board[1]["stories"]] == [20]


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

    stats = story_index_stats(RequestContext(taiga_token="tok", project_id=42))

    assert stats == {
        "total": 2,
        "phase2_designed": 2,
        "phase3_proposed": 1,
        "phase4_tested": 1,
        "phase5_deployed": 1,
    }
