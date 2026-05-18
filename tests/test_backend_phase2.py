"""Tests for the migrated FastAPI Phase 2 backend service."""

import pytest

from backend.app.services.phase2_service import Phase2Service, Phase2ValidationError
from backend.app.services.request_context import RequestContext


class FakeAiService:
    def __init__(self):
        self.tech_stack_args = None
        self.design_args = None

    def suggest_tech_stack(self, all_stories, context, hint):
        self.tech_stack_args = (all_stories, context, hint)
        return [{"name": "FastAPI + Next.js", "description": "Good fit.", "trade_offs": "+ simple"}]

    def generate_phase2_design(self, epic_title, stories, context, cross_epic_context):
        self.design_args = (epic_title, stories, context, cross_epic_context)
        return {
            "wireframes": "SCREEN",
            "user_flow": "flowchart TD\nA-->B",
            "component_tree": "App\n  Page",
            "tech_spec": "openapi: 3.0.0",
        }


class FakeContextService:
    def __init__(self, memory_bank=None, index=None):
        self.project_id = 0
        self.memory_bank = memory_bank or _memory_bank_with_stack()
        self.index = index or _story_index()
        self.written_stack = None
        self.appended_tech = None
        self.appended_bundle = None
        self.appended_design = None

    def set_project(self, project_id: int):
        self.project_id = project_id

    def read_memory_bank(self):
        return self.memory_bank

    def write_tech_stack(self, tech_stack):
        self.written_stack = tech_stack

    def story_index(self):
        return self.index

    def story_gherkin(self, story_id):
        return f"### Story {story_id}\n\n```gherkin\nFeature: Story {story_id}\n```"

    def other_epics_design_context(self, exclude_epic_id):
        return f"other designs except {exclude_epic_id}"

    def append_epic_technical_spec(self, epic_id, epic_title, story_ids, spec):
        self.appended_tech = (epic_id, epic_title, story_ids, spec)

    def append_epic_design_bundle(
        self,
        epic_id,
        epic_title,
        wireframes,
        user_flow,
        component_tree,
        tech_spec,
    ):
        self.appended_bundle = (epic_id, epic_title, wireframes, user_flow, component_tree, tech_spec)

    def append_memory_bank_design(self, epic_id, epic_title, prototype_summary, tech_spec_summary):
        self.appended_design = (epic_id, epic_title, prototype_summary, tech_spec_summary)


class FakeTaigaService:
    def __init__(self, fail_story_id=None):
        self.token = ""
        self.project_id = 0
        self.fail_story_id = fail_story_id
        self.updated_stories = []

    def set_context(self, token, project_id):
        self.token = token
        self.project_id = project_id

    def get_epics(self):
        return [
            {"id": 7, "subject": "Authentication"},
            {"id": 9, "subject": "Billing"},
        ]

    def get_epic(self, epic_id):
        return {"id": epic_id, "subject": "Authentication"}

    def find_design_locked_status_id(self):
        return 12

    def get_story(self, story_id):
        if story_id == self.fail_story_id:
            raise RuntimeError("Taiga unavailable")
        return {"id": story_id, "version": 2, "tags": ["gherkin"]}

    def update_story_fields(self, story_id, version, *, tags=None, status_id=None):
        self.updated_stories.append((story_id, version, tags, status_id))
        return {"id": story_id, "version": version + 1, "tags": tags, "status": status_id}


def _memory_bank_with_stack():
    return """\
# Memory Bank

## Project Concept

Test project.

## Tech Stack

FastAPI + Next.js + PostgreSQL

## Architecture Principles

Keep it simple.
"""


def _memory_bank_without_stack():
    return """\
# Memory Bank

## Tech Stack

<!-- Fill in stack -->

## Architecture Principles

Keep it simple.
"""


def _story_index():
    return {
        "10": {
            "story_id": 10,
            "epic_id": 7,
            "title": "Login",
            "phase_status": "gherkin_locked",
            "has_gherkin": True,
        },
        "11": {
            "story_id": 11,
            "epic_id": 7,
            "title": "Logout",
            "phase_status": "design_locked",
            "has_gherkin": True,
        },
        "12": {
            "story_id": 12,
            "epic_id": 9,
            "title": "Pending Billing",
            "phase_status": "pending",
            "has_gherkin": False,
        },
    }


def _ctx():
    return RequestContext(taiga_token="token", project_id=42)


def _service(context=None, taiga=None):
    ai = FakeAiService()
    context = context or FakeContextService()
    taiga = taiga or FakeTaigaService()
    return Phase2Service(ai=ai, context=context, taiga=taiga), ai, context, taiga


def test_tech_stack_status_detects_locked_stack():
    service, _, context, taiga = _service()

    status = service.tech_stack_status(_ctx())

    assert status == {"defined": True, "tech_stack": "FastAPI + Next.js + PostgreSQL"}
    assert context.project_id == 42
    assert taiga.token == "token"


def test_tech_stack_status_ignores_placeholder_stack():
    service, _, _, _ = _service(context=FakeContextService(memory_bank=_memory_bank_without_stack()))

    assert service.tech_stack_status(_ctx()) == {"defined": False, "tech_stack": None}


def test_eligible_epics_include_only_phase1_locked_epics():
    service, _, _, _ = _service()

    epics = service.eligible_epics(_ctx())

    assert epics == [{
        "epic_id": 7,
        "epic_title": "Authentication",
        "story_count": 2,
        "phase_status": "gherkin_locked",
    }]


def test_propose_tech_stack_requires_locked_stories():
    empty_index = {"1": {"story_id": 1, "epic_id": 7, "phase_status": "pending", "has_gherkin": False}}
    service, _, _, _ = _service(context=FakeContextService(index=empty_index))

    with pytest.raises(Phase2ValidationError, match="No Phase 1 locked"):
        service.propose_tech_stack(_ctx())


def test_propose_tech_stack_passes_all_locked_stories_to_ai():
    service, ai, _, _ = _service()

    alternatives = service.propose_tech_stack(_ctx(), hint="Prefer Python")

    assert alternatives[0]["name"] == "FastAPI + Next.js"
    stories, memory_bank, hint = ai.tech_stack_args
    assert len(stories) == 2
    assert "FastAPI" in memory_bank
    assert hint == "Prefer Python"


def test_lock_tech_stack_writes_memory_bank():
    service, _, context, _ = _service()

    status = service.lock_tech_stack(_ctx(), tech_stack=" Django + React ")

    assert status == {"defined": True, "tech_stack": "Django + React"}
    assert context.written_stack == "Django + React"


def test_generate_design_bundle_requires_locked_tech_stack():
    service, _, _, _ = _service(context=FakeContextService(memory_bank=_memory_bank_without_stack()))

    with pytest.raises(Phase2ValidationError, match="Tech Stack"):
        service.generate_design_bundle(_ctx(), epic_id=7)


def test_generate_design_bundle_injects_binding_stack_constraint():
    service, ai, _, _ = _service()

    bundle = service.generate_design_bundle(_ctx(), epic_id=7)

    assert bundle["tech_spec"] == "openapi: 3.0.0"
    assert bundle["story_ids"] == [10, 11]
    epic_title, stories, context, cross_epic = ai.design_args
    assert epic_title == "Authentication"
    assert [story["story_id"] for story in stories] == [10, 11]
    assert "locked and binding" in context
    assert "FastAPI + Next.js + PostgreSQL" in context
    assert cross_epic == "other designs except 7"


def test_lock_epic_design_persists_artifacts_and_transitions_taiga():
    service, _, context, taiga = _service()

    result = service.lock_epic_design(
        _ctx(),
        epic_id=7,
        epic_title="Authentication",
        story_ids=[10, 11],
        wireframes="SCREEN",
        user_flow="flowchart TD",
        component_tree="App",
        tech_spec="openapi: 3.0.0",
    )

    assert result["ok"] is True
    assert result["taiga_failures"] == []
    assert context.appended_tech == (7, "Authentication", [10, 11], "openapi: 3.0.0")
    assert context.appended_design[0:2] == (7, "Authentication")
    assert context.appended_bundle[0:2] == (7, "Authentication")
    assert taiga.updated_stories == [
        (10, 2, ["apex", "design_locked", "gherkin"], 12),
        (11, 2, ["apex", "design_locked", "gherkin"], 12),
    ]


def test_lock_epic_design_reports_taiga_transition_failures_after_persisting():
    service, _, context, _ = _service(taiga=FakeTaigaService(fail_story_id=11))

    result = service.lock_epic_design(
        _ctx(),
        epic_id=7,
        epic_title="Authentication",
        story_ids=[10, 11],
        wireframes="SCREEN",
        user_flow="flowchart TD",
        component_tree="App",
        tech_spec="openapi: 3.0.0",
    )

    assert result["ok"] is False
    assert result["taiga_failures"] == [{"story_id": 11, "error": "Taiga unavailable"}]
    assert context.appended_tech is not None
