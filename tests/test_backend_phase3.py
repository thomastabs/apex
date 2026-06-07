"""Tests for the Phase 3 backend service (implementation assist)."""

import pytest

from backend.app.services.phase3_service import Phase3Service, Phase3ValidationError
from backend.app.services.request_context import RequestContext


_FAKE_GHERKIN = "Feature: Login\n  Scenario: Successful login\n    Given a registered user\n    When they submit valid credentials\n    Then they receive a JWT token"

_FAKE_TECH_SPEC = "## Endpoints\n- `POST /auth/login` · auth:none · in:{email:str,password:str} · out:{token:str}"

_FAKE_DESIGN_BUNDLE = "## UX Brief\n- Login screen\n## Endpoints\n- POST /auth/login\n## Data Model\n### User\n- Fields: id, email"

_FAKE_TECH_STACK = "FastAPI + Next.js + PostgreSQL"

_FAKE_TASKS = [
    {"id": 1, "subject": "Create User model and migration", "description": "Define SQLAlchemy User model."},
    {"id": 2, "subject": "Implement POST /auth/login endpoint", "description": "Validate credentials and return JWT."},
]

_FAKE_PROPOSAL = (
    "## Context\nImplementing login endpoint.\n\n"
    "## Implementation Steps\n1. Create endpoint.\n\n"
    "## Test Assertions\n- POST /auth/login returns 200.\n\n"
    "## AI Prompt\nYou are implementing..."
)


class FakeAiService:
    def __init__(self):
        self.generate_tasks_args = None
        self.generate_proposal_args = None
        self.generate_proposal_kwargs: dict = {}

    def generate_tasks(self, story_subject, gherkin, technical_spec, tech_stack="", design_bundle="", github_context=""):
        self.generate_tasks_args = (story_subject, gherkin, technical_spec, tech_stack, design_bundle)
        return _FAKE_TASKS

    def generate_proposal(
        self,
        task_subject,
        task_description,
        gherkin,
        technical_spec,
        tech_stack="",
        design_bundle="",
        story_ref="",
        github_context="",
        hint="",
        recent_commits="",
        other_tasks=None,
    ):
        self.generate_proposal_args = (task_subject, task_description, gherkin, technical_spec,
                                       tech_stack, design_bundle, story_ref)
        self.generate_proposal_kwargs = {
            "hint": hint,
            "recent_commits": recent_commits,
            "other_tasks": other_tasks,
        }
        return _FAKE_PROPOSAL


class FakeContextService:
    def __init__(self, index=None):
        self.project_id = 0
        self.index = index if index is not None else _story_index()
        self.saved_proposals: list[tuple] = []
        self.upserted: list[tuple] = []

    def set_project(self, project_id: int):
        self.project_id = project_id

    def story_index(self):
        return self.index

    def story_gherkin(self, story_id: int) -> str:
        return _FAKE_GHERKIN

    def story_technical_spec(self, story_id: int) -> str:
        return _FAKE_TECH_SPEC

    def read_project_concept(self) -> str:
        return "A project about authentication."

    def read_tech_stack(self) -> str:
        return _FAKE_TECH_STACK

    def read_context_file(self, filename: str) -> str:
        return _FAKE_DESIGN_BUNDLE

    def save_proposal(self, story_id: int, task_id: int, proposal_md: str) -> None:
        self.saved_proposals.append((story_id, task_id, proposal_md))

    def upsert_story_index(self, story_id: int, **updates) -> None:
        self.upserted.append((story_id, updates))

    def proposal_exists(self, story_id: int, task_id: int) -> bool:
        return any(s == story_id and t == task_id for s, t, _ in self.saved_proposals)


def _story_index(status: str = "design_locked") -> dict:
    return {
        "10": {
            "story_id": 10,
            "epic_id": 1,
            "epic_title": "Authentication",
            "title": "User Login",
            "phase_status": status,
            "has_gherkin": True,
            "has_proposal": False,
        }
    }


def _ctx() -> RequestContext:
    return RequestContext(pm_token="tok", project_id=1)


# ---------------------------------------------------------------------------
# get_eligible_stories
# ---------------------------------------------------------------------------

def test_eligible_stories_returns_design_locked():
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService())
    stories = svc.get_eligible_stories(_ctx())
    assert len(stories) == 1
    assert stories[0]["story_id"] == 10
    assert stories[0]["title"] == "User Login"


def test_eligible_stories_excludes_other_statuses():
    index = {
        "1": {"story_id": 1, "title": "A", "phase_status": "gherkin_locked", "epic_title": "X"},
        "2": {"story_id": 2, "title": "B", "phase_status": "implementation", "epic_title": "X"},
        "3": {"story_id": 3, "title": "C", "phase_status": "design_locked", "epic_title": "X"},
    }
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService(index=index))
    stories = svc.get_eligible_stories(_ctx())
    assert len(stories) == 1
    assert stories[0]["story_id"] == 3


# ---------------------------------------------------------------------------
# get_story_context
# ---------------------------------------------------------------------------

def test_get_story_context_returns_all_fields():
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService())
    ctx_data = svc.get_story_context(_ctx(), 10)
    assert ctx_data["story_id"] == 10
    assert ctx_data["gherkin"] == _FAKE_GHERKIN
    assert ctx_data["technical_spec"] == _FAKE_TECH_SPEC
    assert ctx_data["design_bundle"] == _FAKE_DESIGN_BUNDLE
    assert ctx_data["tech_stack"] == _FAKE_TECH_STACK


def test_get_story_context_raises_for_unknown_story():
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService())
    with pytest.raises(Phase3ValidationError, match="not found"):
        svc.get_story_context(_ctx(), 999)


# ---------------------------------------------------------------------------
# generate_tasks
# ---------------------------------------------------------------------------

def test_generate_tasks_returns_tasks():
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())
    tasks = svc.generate_tasks(_ctx(), 10)
    assert len(tasks) == 2
    assert tasks[0]["subject"] == "Create User model and migration"


def test_generate_tasks_passes_full_context_to_ai():
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())
    svc.generate_tasks(_ctx(), 10)
    _, _, _, tech_stack, design_bundle = ai.generate_tasks_args
    assert tech_stack == _FAKE_TECH_STACK
    assert design_bundle == _FAKE_DESIGN_BUNDLE


def test_generate_tasks_rejects_non_design_locked():
    index = _story_index(status="gherkin_locked")
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService(index=index))
    with pytest.raises(Phase3ValidationError, match="not design_locked"):
        svc.generate_tasks(_ctx(), 10)


# ---------------------------------------------------------------------------
# generate_proposal
# ---------------------------------------------------------------------------

def test_generate_proposal_returns_markdown():
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService())
    md = svc.generate_proposal(_ctx(), 10, 1, "Implement endpoint", "Create the login route.")
    assert "## Context" in md
    assert "## Implementation Steps" in md
    assert "## AI Prompt" in md


def test_generate_proposal_passes_design_context():
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())
    svc.generate_proposal(_ctx(), 10, 1, "Implement endpoint", "Create the login route.")
    args = ai.generate_proposal_args
    tech_stack = args[4]
    design_bundle = args[5]
    assert tech_stack == _FAKE_TECH_STACK
    assert design_bundle == _FAKE_DESIGN_BUNDLE


# ---------------------------------------------------------------------------
# save_proposal
# ---------------------------------------------------------------------------

def test_save_proposal_delegates_to_context():
    ctx_svc = FakeContextService()
    svc = Phase3Service(ai=FakeAiService(), context=ctx_svc)
    svc.save_proposal(_ctx(), 10, 1, "## Context\nHello.")
    assert len(ctx_svc.saved_proposals) == 1
    assert ctx_svc.saved_proposals[0] == (10, 1, "## Context\nHello.")


# ---------------------------------------------------------------------------
# lock_story
# ---------------------------------------------------------------------------

def test_lock_story_transitions_to_implementation():
    ctx_svc = FakeContextService()
    ctx_svc.saved_proposals.append((10, 1, "## pack"))
    svc = Phase3Service(ai=FakeAiService(), context=ctx_svc)
    svc.lock_story(_ctx(), 10, [1])
    assert len(ctx_svc.upserted) == 1
    story_id, updates = ctx_svc.upserted[0]
    assert story_id == 10
    assert updates["phase_status"] == "implementation"
    assert updates["has_proposal"] is True


# ---------------------------------------------------------------------------
# generate_proposal — hint / all_tasks / recent_commits passthrough
# ---------------------------------------------------------------------------

def test_generate_proposal_passes_hint_to_ai():
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())
    svc.generate_proposal(_ctx(), 10, 1, "Implement endpoint", "Build it.", hint="prefer async")
    assert ai.generate_proposal_kwargs["hint"] == "prefer async"


def test_generate_proposal_passes_recent_commits_to_ai():
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())
    svc.generate_proposal(
        _ctx(), 10, 1, "Implement endpoint", "Build it.",
        recent_commits_context="- abc123: add auth module",
    )
    assert ai.generate_proposal_kwargs["recent_commits"] == "- abc123: add auth module"


def test_generate_proposal_filters_current_task_from_all_tasks():
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())
    all_tasks = [
        {"id": 1, "subject": "Implement endpoint", "description": "current task"},
        {"id": 2, "subject": "Write migration", "description": "another task"},
    ]
    svc.generate_proposal(
        _ctx(), 10, 1, "Implement endpoint", "Build it.",
        all_tasks=all_tasks,
    )
    other = ai.generate_proposal_kwargs["other_tasks"]
    subjects = [t["subject"] for t in other]
    assert "Implement endpoint" not in subjects
    assert "Write migration" in subjects


def test_generate_proposal_empty_hint_passes_through():
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())
    svc.generate_proposal(_ctx(), 10, 1, "Implement endpoint", "Build it.")
    assert ai.generate_proposal_kwargs["hint"] == ""
