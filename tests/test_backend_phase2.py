"""Tests for the Phase 2 backend service (unified project design bundle)."""

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

    def generate_project_design(self, all_epics_stories, context):
        self.design_args = (all_epics_stories, context)
        return {
            "wireframes": "SCREEN",
            "user_flow": "flowchart TD\nA-->B",
            "component_tree": "App\n  Page",
            "tech_spec": "openapi: 3.0.0",
        }


class FakeContextService:
    def __init__(self, tech_stack=None, project_concept=None, index=None):
        self.project_id = 0
        self.tech_stack = tech_stack if tech_stack is not None else _tech_stack_with_content()
        self.project_concept = project_concept if project_concept is not None else "Test project."
        self.index = index if index is not None else _story_index()
        self.written_stack = None
        self.written_bundle = None
        self.written_tech_spec = None

    def set_project(self, project_id: int):
        self.project_id = project_id

    def read_tech_stack(self):
        return self.tech_stack

    def read_project_concept(self):
        return self.project_concept

    def write_tech_stack(self, tech_stack):
        self.written_stack = tech_stack

    def story_index(self):
        return self.index

    def story_gherkin(self, story_id):
        return f"### Story {story_id}\n\n```gherkin\nFeature: Story {story_id}\n```"

    def write_project_design_bundle(self, wireframes, user_flow, component_tree, tech_spec):
        self.written_bundle = (wireframes, user_flow, component_tree, tech_spec)

    def write_project_technical_spec(self, story_ids, spec):
        self.written_tech_spec = (story_ids, spec)


def _tech_stack_with_content():
    return "FastAPI + Next.js + PostgreSQL"


def _tech_stack_empty():
    return ""


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


def _service(context=None):
    ai = FakeAiService()
    context = context or FakeContextService()
    return Phase2Service(ai=ai, context=context), ai, context


def test_tech_stack_status_detects_locked_stack():
    service, _, context = _service()

    status = service.tech_stack_status(_ctx())

    assert status == {"defined": True, "tech_stack": "FastAPI + Next.js + PostgreSQL"}
    assert context.project_id == 42


def test_tech_stack_status_ignores_placeholder_stack():
    service, _, _ = _service(context=FakeContextService(tech_stack=_tech_stack_empty()))

    assert service.tech_stack_status(_ctx()) == {"defined": False, "tech_stack": None}


def test_propose_tech_stack_requires_locked_stories():
    empty_index = {"1": {"story_id": 1, "epic_id": 7, "phase_status": "pending", "has_gherkin": False}}
    service, _, _ = _service(context=FakeContextService(index=empty_index))

    with pytest.raises(Phase2ValidationError, match="No Phase 1 locked"):
        service.propose_tech_stack(_ctx())


def test_propose_tech_stack_passes_all_locked_stories_to_ai():
    service, ai, _ = _service()

    alternatives = service.propose_tech_stack(_ctx(), hint="Prefer Python")

    assert alternatives[0]["name"] == "FastAPI + Next.js"
    stories, tech_stack, hint = ai.tech_stack_args
    assert len(stories) == 2
    assert "FastAPI" in tech_stack
    assert hint == "Prefer Python"


def test_lock_tech_stack_saves_tech_stack():
    service, _, context = _service()

    status = service.lock_tech_stack(_ctx(), tech_stack=" Django + React ")

    assert status == {"defined": True, "tech_stack": "Django + React"}
    assert context.written_stack == "Django + React"


def test_generate_design_bundle_requires_locked_tech_stack():
    service, _, _ = _service(context=FakeContextService(tech_stack=_tech_stack_empty()))

    with pytest.raises(Phase2ValidationError, match="Tech Stack"):
        service.generate_design_bundle(_ctx())


def test_generate_design_bundle_requires_eligible_stories():
    empty_index = {"1": {"story_id": 1, "epic_id": 7, "phase_status": "pending", "has_gherkin": False}}
    service, _, _ = _service(context=FakeContextService(index=empty_index))

    with pytest.raises(Phase2ValidationError, match="No Phase 1 locked"):
        service.generate_design_bundle(_ctx())


def test_generate_design_bundle_passes_all_stories_to_ai():
    service, ai, _ = _service()

    bundle = service.generate_design_bundle(_ctx(), epics=[{"id": 7, "subject": "Authentication"}, {"id": 9, "subject": "Billing"}])

    assert bundle["tech_spec"] == "openapi: 3.0.0"
    assert sorted(bundle["story_ids"]) == [10, 11]
    all_stories, context = ai.design_args
    assert len(all_stories) == 2
    assert "locked and binding" in context
    assert "FastAPI + Next.js + PostgreSQL" in context


def test_generate_design_bundle_groups_stories_by_epic():
    service, ai, _ = _service()
    service.generate_design_bundle(_ctx(), epics=[{"id": 7, "subject": "Authentication"}, {"id": 9, "subject": "Billing"}])
    all_stories, _ = ai.design_args
    epic_titles = {s["epic_title"] for s in all_stories}
    assert "Authentication" in epic_titles


def test_generate_design_bundle_stories_sorted_by_id():
    service, ai, _ = _service()
    service.generate_design_bundle(_ctx(), epics=[{"id": 7, "subject": "Authentication"}, {"id": 9, "subject": "Billing"}])
    all_stories, _ = ai.design_args
    ids = [s["story_id"] for s in all_stories]
    assert ids == sorted(ids)


# ---------------------------------------------------------------------------
# tech_stack_status — additional edge cases
# ---------------------------------------------------------------------------

def test_tech_stack_status_empty_string_returns_undefined():
    service, _, _ = _service(context=FakeContextService(tech_stack=""))
    assert service.tech_stack_status(_ctx()) == {"defined": False, "tech_stack": None}


def test_tech_stack_status_whitespace_only_returns_undefined():
    service, _, _ = _service(context=FakeContextService(tech_stack="   "))
    assert service.tech_stack_status(_ctx()) == {"defined": False, "tech_stack": None}


# ---------------------------------------------------------------------------
# propose_tech_stack — additional assertions
# ---------------------------------------------------------------------------

def test_propose_tech_stack_passes_tech_stack_to_ai():
    service, ai, _ = _service()
    service.propose_tech_stack(_ctx())
    _, tech_stack, _ = ai.tech_stack_args
    assert "FastAPI + Next.js + PostgreSQL" in tech_stack


def test_propose_tech_stack_excludes_pending_stories():
    service, ai, _ = _service()
    service.propose_tech_stack(_ctx())
    stories, _, _ = ai.tech_stack_args
    titles = [s["title"] for s in stories]
    assert "Pending Billing" not in titles


# ---------------------------------------------------------------------------
# lock_tech_stack — validation guard
# ---------------------------------------------------------------------------

def test_lock_tech_stack_empty_raises():
    service, _, _ = _service()
    with pytest.raises(Phase2ValidationError, match="tech_stack is required"):
        service.lock_tech_stack(_ctx(), tech_stack="   ")


# ---------------------------------------------------------------------------
# tech_stack_status — content passthrough
# ---------------------------------------------------------------------------

def test_tech_stack_status_single_line_content():
    service, _, _ = _service(context=FakeContextService(tech_stack="React + FastAPI"))
    assert service.tech_stack_status(_ctx())["tech_stack"] == "React + FastAPI"


def test_tech_stack_status_multiline_content():
    service, _, _ = _service(context=FakeContextService(tech_stack="- Next.js\n- FastAPI\n- PostgreSQL"))
    result = service.tech_stack_status(_ctx())["tech_stack"]
    assert "Next.js" in result
    assert "PostgreSQL" in result
