"""Tests for the Phase 2 backend service (unified project design bundle)."""

import pytest

from backend.app.services.phase2_service import Phase2Service, Phase2ValidationError
from backend.app.services.request_context import RequestContext


_FAKE_SECTION_CONTENT = {
    "ux_brief":   "## Screens\n- Login\n## Navigation Paths\n- Login → Dashboard",
    "endpoints":  "## Endpoints\n### Auth\n- `POST /auth/login` — login (Story 10)",
    "data_model": "## Data Model\n### User\n- Fields: id:int, email:str",
}


class FakeAiService:
    def __init__(self):
        self.tech_stack_args = None
        self.section_args: list[tuple] = []

    def suggest_tech_stack(self, all_stories, context, hint):
        self.tech_stack_args = (all_stories, context, hint)
        return [{"name": "FastAPI + Next.js", "description": "Good fit.", "trade_offs": "+ simple"}]

    def generate_design_section(self, all_stories, context, section, prior_sections) -> str:
        self.section_args.append((all_stories, context, section, prior_sections))
        return _FAKE_SECTION_CONTENT[section]


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

    def write_project_design_bundle(self, ux_brief: str, endpoints: str, data_model: str) -> None:
        self.written_bundle = (ux_brief, endpoints, data_model)

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
            "epic_title": "Authentication",
            "title": "Login",
            "phase_status": "gherkin_locked",
            "has_gherkin": True,
        },
        "11": {
            "story_id": 11,
            "epic_id": 7,
            "epic_title": "Authentication",
            "title": "Logout",
            "phase_status": "design_locked",
            "has_gherkin": True,
        },
        "12": {
            "story_id": 12,
            "epic_id": 9,
            "epic_title": "Billing",
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


def test_generate_design_section_requires_locked_tech_stack():
    service, _, _ = _service(context=FakeContextService(tech_stack=_tech_stack_empty()))

    with pytest.raises(Phase2ValidationError, match="Tech Stack"):
        service.generate_design_section(_ctx(), section="ux_brief")


def test_generate_design_section_requires_eligible_stories():
    empty_index = {"1": {"story_id": 1, "epic_id": 7, "phase_status": "pending", "has_gherkin": False}}
    service, _, _ = _service(context=FakeContextService(index=empty_index))

    with pytest.raises(Phase2ValidationError, match="No Phase 1 locked"):
        service.generate_design_section(_ctx(), section="endpoints")


def test_generate_design_section_rejects_unknown_section():
    service, _, _ = _service()

    with pytest.raises(Phase2ValidationError, match="Unknown section"):
        service.generate_design_section(_ctx(), section="bad_section")


def test_generate_design_section_ux_brief_returns_content_and_story_ids():
    service, ai, _ = _service()

    result = service.generate_design_section(_ctx(), section="ux_brief")

    assert result["section"] == "ux_brief"
    assert "Screens" in result["content"]
    assert sorted(result["story_ids"]) == [10, 11]


def test_generate_design_section_passes_constrained_context():
    service, ai, _ = _service()

    service.generate_design_section(_ctx(), section="ux_brief")

    _, context, section, prior = ai.section_args[0]
    assert section == "ux_brief"
    assert "locked and binding" in context or "Locked Tech Stack Constraint" in context
    assert "FastAPI + Next.js + PostgreSQL" in context


def test_generate_design_section_passes_prior_sections_as_context():
    service, ai, _ = _service()
    prior = {"ux_brief": "## Screens\n- Login", "endpoints": "## Endpoints\n- POST /auth"}

    service.generate_design_section(_ctx(), section="data_model", prior_sections=prior)

    _, _, section, received_prior = ai.section_args[0]
    assert section == "data_model"
    assert received_prior["endpoints"] == "## Endpoints\n- POST /auth"


def test_generate_design_section_stories_sorted_by_id():
    service, ai, _ = _service()

    service.generate_design_section(_ctx(), section="ux_brief")

    all_stories, _, _, _ = ai.section_args[0]
    ids = [s["story_id"] for s in all_stories]
    assert ids == sorted(ids)


def test_generate_design_section_includes_epic_titles_from_index():
    service, ai, _ = _service()

    service.generate_design_section(_ctx(), section="ux_brief")

    all_stories, _, _, _ = ai.section_args[0]
    epic_titles = {s["epic_title"] for s in all_stories}
    assert "Authentication" in epic_titles


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
