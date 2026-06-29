"""API route tests for Phase 3 FastAPI routes."""

import pytest
from fastapi import HTTPException

from backend.app.api.deps import get_request_context
from backend.app.api.phase3 import (
    eligible_stories,
    generate_proposal,
    generate_tasks,
    get_proposals,
    lock_story,
    save_proposal,
    story_context,
)
from backend.app.schemas.phase3 import (
    GenerateProposalRequest,
    GenerateTasksRequest,
    LockStoryRequest,
    SaveProposalRequest,
    TaskSummary,
)
from src.ai_engine import AIError, AIRateLimitError, AITimeoutError


_FAKE_PROPOSAL = (
    "## Context\nLogin endpoint.\n\n"
    "## Implementation Steps\n1. Build it.\n\n"
    "## Files to Change\n- auth.py\n\n"
    "## Test Assertions\n- POST /auth/login returns 200.\n\n"
    "## Agentic Brief\nTask: Implement login.\n\n"
    "## Chat Prompt\nYou are implementing...\n\n"
    "## CLAUDE.md Snippet\n### Active Task\n- Implement login."
)

_FAKE_TASKS = [
    {
        "id": 1,
        "subject": "Create User model",
        "description": "SQLAlchemy model.",
        "effort_estimate": "S",
        "covered_scenarios": ["Login"],
        "predecessor_task_ids": [],
    },
    {
        "id": 2,
        "subject": "POST /auth/login endpoint",
        "description": "Validate and issue JWT.",
        "effort_estimate": "M",
        "covered_scenarios": ["Login"],
        "predecessor_task_ids": [1],
    },
]


class StubPhase3Service:
    def __init__(self):
        self.last_generate_proposal_kwargs: dict = {}

    def configure_request(self, ctx):
        pass

    def get_eligible_stories(self, ctx):
        return [
            {
                "story_id": 10,
                "title": "User Login",
                "epic_title": "Auth",
                "gherkin_preview": "Feature: Login",
                "tech_spec_preview": "POST /auth/login",
            }
        ]

    def get_story_context(self, ctx, story_id):
        return {
            "story_id": story_id,
            "title": "User Login",
            "epic_title": "Auth",
            "gherkin": "Feature: Login",
            "technical_spec": "POST /auth/login",
            "project_concept": "Auth app.",
            "tech_stack": "FastAPI",
            "design_bundle": "## UX\n- Login screen",
        }

    def generate_tasks(self, ctx, story_id, instructions=""):
        return _FAKE_TASKS

    def generate_proposal(
        self,
        ctx,
        story_id,
        task_id,
        task_subject,
        task_description,
        hint="",
        recent_commits_context="",
        all_tasks=None,
        figma_token="",
    ):
        self.last_generate_proposal_kwargs = {
            "hint": hint,
            "recent_commits_context": recent_commits_context,
            "all_tasks": all_tasks,
            "figma_token": figma_token,
        }
        return _FAKE_PROPOSAL

    def save_proposal(self, ctx, story_id, task_id, proposal_md):
        pass

    def get_proposals(self, ctx, story_id):
        return [{"task_id": 1, "proposal_md": _FAKE_PROPOSAL}]

    def lock_story(self, ctx, story_id, task_ids):
        pass


def _ctx():
    return get_request_context("Bearer tok", 42)


# ---------------------------------------------------------------------------
# eligible-stories
# ---------------------------------------------------------------------------

def test_eligible_stories_route():
    result = eligible_stories(ctx=_ctx(), service=StubPhase3Service())
    assert len(result["stories"]) == 1
    assert result["stories"][0]["story_id"] == 10
    assert result["stories"][0]["title"] == "User Login"


# ---------------------------------------------------------------------------
# story-context
# ---------------------------------------------------------------------------

def test_story_context_route():
    result = story_context(story_id=10, ctx=_ctx(), service=StubPhase3Service())
    assert result["story_id"] == 10
    assert result["gherkin"] == "Feature: Login"
    assert result["tech_stack"] == "FastAPI"


# ---------------------------------------------------------------------------
# generate-tasks
# ---------------------------------------------------------------------------

def test_generate_tasks_route():
    result = generate_tasks(
        GenerateTasksRequest(story_id=10),
        ctx=_ctx(),
        service=StubPhase3Service(),
        _rl=None,
    )
    assert result["story_id"] == 10
    assert len(result["tasks"]) == 2
    assert result["tasks"][0]["subject"] == "Create User model"


# ---------------------------------------------------------------------------
# generate-proposal
# ---------------------------------------------------------------------------

def test_generate_proposal_route_basic():
    result = generate_proposal(
        GenerateProposalRequest(
            story_id=10,
            task_id=1,
            task_subject="Create User model",
            task_description="SQLAlchemy model.",
        ),
        ctx=_ctx(),
        service=StubPhase3Service(),
        _rl=None,
        x_figma_token="",
    )
    assert "## Context" in result["proposal_md"]
    assert "## Agentic Brief" in result["proposal_md"]
    assert "## CLAUDE.md Snippet" in result["proposal_md"]


def test_generate_proposal_passes_hint():
    svc = StubPhase3Service()
    generate_proposal(
        GenerateProposalRequest(
            story_id=10,
            task_id=1,
            task_subject="Create User model",
            task_description="SQLAlchemy model.",
            hint="use SQLModel instead of SQLAlchemy",
        ),
        ctx=_ctx(),
        service=svc,
        _rl=None,
        x_figma_token="",
    )
    assert svc.last_generate_proposal_kwargs["hint"] == "use SQLModel instead of SQLAlchemy"


def test_generate_proposal_passes_all_tasks():
    svc = StubPhase3Service()
    all_tasks = [
        TaskSummary(id=1, subject="Create User model", description="SQLAlchemy model."),
        TaskSummary(id=2, subject="POST /auth/login endpoint", description="Validate and issue JWT."),
    ]
    generate_proposal(
        GenerateProposalRequest(
            story_id=10,
            task_id=1,
            task_subject="Create User model",
            task_description="SQLAlchemy model.",
            all_tasks=all_tasks,
        ),
        ctx=_ctx(),
        service=svc,
        _rl=None,
        x_figma_token="",
    )
    passed = svc.last_generate_proposal_kwargs["all_tasks"]
    assert len(passed) == 2
    subjects = [t["subject"] for t in passed]
    assert "Create User model" in subjects
    assert "POST /auth/login endpoint" in subjects


def test_generate_proposal_passes_recent_commits():
    svc = StubPhase3Service()
    commits = "- abc123: add auth module"
    generate_proposal(
        GenerateProposalRequest(
            story_id=10,
            task_id=1,
            task_subject="Create User model",
            task_description="",
            recent_commits_context=commits,
        ),
        ctx=_ctx(),
        service=svc,
        _rl=None,
        x_figma_token="",
    )
    assert svc.last_generate_proposal_kwargs["recent_commits_context"] == commits


# ---------------------------------------------------------------------------
# save-proposal
# ---------------------------------------------------------------------------

def test_save_proposal_route():
    result = save_proposal(
        SaveProposalRequest(story_id=10, task_id=1, proposal_md=_FAKE_PROPOSAL),
        ctx=_ctx(),
        service=StubPhase3Service(),
    )
    assert result == {"ok": True}


# ---------------------------------------------------------------------------
# proposals
# ---------------------------------------------------------------------------

def test_get_proposals_route():
    result = get_proposals(story_id=10, ctx=_ctx(), service=StubPhase3Service())
    assert result["story_id"] == 10
    assert len(result["proposals"]) == 1
    assert result["proposals"][0]["task_id"] == 1


# ---------------------------------------------------------------------------
# lock-story
# ---------------------------------------------------------------------------

def test_lock_story_route():
    result = lock_story(
        LockStoryRequest(story_id=10, task_ids=[1, 2]),
        ctx=_ctx(),
        service=StubPhase3Service(),
    )
    assert result == {"ok": True}


# ---------------------------------------------------------------------------
# Error mapping
# ---------------------------------------------------------------------------

def test_phase3_validation_error_maps_to_422():
    class FailingService(StubPhase3Service):
        def get_story_context(self, ctx, story_id):
            from backend.app.services.phase3_service import Phase3ValidationError
            raise Phase3ValidationError("Story not found")

    with pytest.raises(HTTPException) as exc:
        story_context(story_id=999, ctx=_ctx(), service=FailingService())

    assert exc.value.status_code == 422


def test_ai_rate_limit_error_maps_to_429():
    class FailingService(StubPhase3Service):
        def generate_tasks(self, ctx, story_id, instructions=""):
            raise AIRateLimitError("Rate limited")

    with pytest.raises(HTTPException) as exc:
        generate_tasks(
            GenerateTasksRequest(story_id=10),
            ctx=_ctx(),
            service=FailingService(),
            _rl=None,
        )

    assert exc.value.status_code == 429


def test_ai_timeout_error_maps_to_504():
    class FailingService(StubPhase3Service):
        def generate_proposal(self, ctx, story_id, task_id, task_subject, task_description, **kwargs):
            raise AITimeoutError("LLM timed out")

    with pytest.raises(HTTPException) as exc:
        generate_proposal(
            GenerateProposalRequest(
                story_id=10, task_id=1,
                task_subject="x", task_description="y",
            ),
            ctx=_ctx(),
            service=FailingService(),
            _rl=None,
            x_figma_token="",
        )

    assert exc.value.status_code == 504


def test_ai_error_maps_to_502():
    class FailingService(StubPhase3Service):
        def generate_proposal(self, ctx, story_id, task_id, task_subject, task_description, **kwargs):
            raise AIError("Model overloaded")

    with pytest.raises(HTTPException) as exc:
        generate_proposal(
            GenerateProposalRequest(
                story_id=10, task_id=1,
                task_subject="x", task_description="y",
            ),
            ctx=_ctx(),
            service=FailingService(),
            _rl=None,
            x_figma_token="",
        )

    assert exc.value.status_code == 502


def test_lock_story_validation_error_maps_to_422():
    class FailingService(StubPhase3Service):
        def lock_story(self, ctx, story_id, task_ids):
            from backend.app.services.phase3_service import Phase3ValidationError
            raise Phase3ValidationError("Tasks missing proposals")

    with pytest.raises(HTTPException) as exc:
        lock_story(
            LockStoryRequest(story_id=10, task_ids=[1]),
            ctx=_ctx(),
            service=FailingService(),
        )

    assert exc.value.status_code == 422


def test_unknown_errors_bubble_up():
    class FailingService(StubPhase3Service):
        def get_eligible_stories(self, ctx):
            raise RuntimeError("unexpected crash")

    with pytest.raises(RuntimeError, match="unexpected crash"):
        eligible_stories(ctx=_ctx(), service=FailingService())
