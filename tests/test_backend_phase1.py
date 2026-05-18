"""Tests for the migrated FastAPI Phase 1 backend service."""

import pytest

from backend.app.services.phase1_service import Phase1Service, Phase1ValidationError
from backend.app.services.request_context import RequestContext


class FakeAiService:
    def __init__(self):
        self.generated_args = None
        self.bolded = []

    def suggest_epics(self, project_concept: str, hint: str) -> list[dict]:
        return [{"title": "Account Access", "description": f"{project_concept}|{hint}"}]

    def generate_nl_stories(
        self,
        epic_subject: str,
        epic_description: str,
        *,
        hint: str,
        project_concept: str,
    ) -> tuple[str, int]:
        self.generated_args = (epic_subject, epic_description, hint, project_concept)
        return "[S] Story A", 1

    def compile_gherkin(self, nl_draft: str) -> list[dict]:
        return [{"title": "Story A", "size": "S", "gherkin": "Feature: A\n\n  Scenario: s"}]

    def bold_gherkin_keywords(self, gherkin: str) -> str:
        self.bolded.append(gherkin)
        return f"bold:{gherkin}"


class FakeContextService:
    def __init__(self):
        self.project_id = 0
        self.appended = []
        self.initialized = False

    def set_project(self, project_id: int) -> None:
        self.project_id = project_id

    def project_concept(self) -> str:
        return "Project concept"

    def init_context(self) -> None:
        self.initialized = True

    def append_gherkin(self, story_id, story_title, gherkin, *, epic_id, epic_title) -> None:
        self.appended.append({
            "story_id": story_id,
            "story_title": story_title,
            "gherkin": gherkin,
            "epic_id": epic_id,
            "epic_title": epic_title,
        })


class FakeTaigaService:
    def __init__(self):
        self.token = ""
        self.project_id = 0
        self.created_epics = []
        self.created_stories = []
        self.status_updates = []

    def set_context(self, token: str, project_id: int) -> None:
        self.token = token
        self.project_id = project_id

    def get_epics(self) -> list[dict]:
        return [{"id": 10, "ref": 1, "subject": "Epic", "description": "", "tags": []}]

    def get_epic(self, epic_id: int) -> dict:
        return {"id": epic_id, "subject": "Loaded Epic"}

    def create_epic(self, subject: str, description: str) -> dict:
        epic = {"id": 20, "subject": subject, "description": description}
        self.created_epics.append(epic)
        return epic

    def find_ready_status_id(self) -> int:
        return 7

    def create_story(self, subject, description, *, epic_id, tags, backlog_order) -> dict:
        story = {
            "id": 100 + backlog_order,
            "version": 3,
            "subject": subject,
            "description": description,
            "epic_id": epic_id,
            "tags": tags,
            "backlog_order": backlog_order,
        }
        self.created_stories.append(story)
        return story

    def update_story_status(self, story_id: int, status_id: int, version: int) -> dict:
        self.status_updates.append((story_id, status_id, version))
        return {"id": story_id, "version": version + 1}

    def get_story(self, story_id: int) -> dict:
        return {"id": story_id, "ref": story_id + 1000}

    def get_story_url(self, story_ref: int | None) -> str | None:
        return f"https://taiga.test/us/{story_ref}" if story_ref else None


def _service():
    ai = FakeAiService()
    context = FakeContextService()
    taiga = FakeTaigaService()
    return Phase1Service(ai=ai, context=context, taiga=taiga), ai, context, taiga


def _ctx() -> RequestContext:
    return RequestContext(taiga_token="token", project_id=42)


def _valid_story(title: str = "Story A") -> dict:
    return {
        "title": title,
        "size": "S",
        "gherkin": (
            "Feature: Story A\n\n"
            "  Scenario: Happy path\n"
            "    Given x\n"
            "    When y\n"
            "    Then z\n"
        ),
    }


def test_list_epics_configures_request_context():
    service, _, context, taiga = _service()

    epics = service.list_epics(_ctx())

    assert epics[0]["id"] == 10
    assert context.project_id == 42
    assert taiga.token == "token"
    assert taiga.project_id == 42


def test_generate_nl_stories_injects_project_concept():
    service, ai, _, _ = _service()

    draft, count = service.generate_nl_stories(
        _ctx(),
        epic_subject="Epic",
        epic_description="Description",
        hint="Keep small",
    )

    assert draft == "[S] Story A"
    assert count == 1
    assert ai.generated_args == ("Epic", "Description", "Keep small", "Project concept")


def test_generate_nl_stories_requires_subject():
    service, _, _, _ = _service()

    with pytest.raises(Phase1ValidationError, match="epic_subject"):
        service.generate_nl_stories(_ctx(), epic_subject=" ", epic_description="")


def test_compile_gherkin_requires_draft():
    service, _, _, _ = _service()

    with pytest.raises(Phase1ValidationError, match="nl_draft"):
        service.compile_gherkin(nl_draft="")


def test_push_stories_creates_epic_story_and_context_entry():
    service, ai, context, taiga = _service()

    result = service.push_stories(
        _ctx(),
        epic_subject="New Epic",
        epic_description="Scope",
        epic_id=None,
        stories=[_valid_story()],
    )

    assert result["ok"] is True
    assert result["epic_id"] == 20
    assert result["story_ids"] == [100]
    assert result["story_urls"] == ["https://taiga.test/us/1100"]
    assert context.initialized is True
    assert taiga.created_epics[0]["subject"] == "New Epic"
    assert taiga.created_stories[0]["description"].startswith("bold:Feature")
    assert taiga.status_updates == [(100, 7, 3)]
    assert context.appended[0]["epic_id"] == 20
    assert context.appended[0]["story_title"] == "Story A"
    assert ai.bolded[0].startswith("Feature: Story A")


def test_push_stories_uses_existing_epic_when_id_is_provided():
    service, _, context, taiga = _service()

    result = service.push_stories(
        _ctx(),
        epic_subject="Ignored",
        epic_description="Ignored",
        epic_id=55,
        stories=[_valid_story()],
    )

    assert result["epic_id"] == 55
    assert taiga.created_epics == []
    assert context.appended[0]["epic_title"] == "Loaded Epic"


def test_push_stories_rejects_invalid_gherkin():
    service, _, _, _ = _service()

    with pytest.raises(Phase1ValidationError, match="Feature"):
        service.push_stories(
            _ctx(),
            epic_subject="Epic",
            epic_description="",
            epic_id=None,
            stories=[{"title": "Bad", "size": "S", "gherkin": "Scenario: Missing feature"}],
        )
