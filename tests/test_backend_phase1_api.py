"""API route tests for the migrated Phase 1 FastAPI backend."""

import pytest
from fastapi import HTTPException

from backend.app.api.deps import get_request_context
from backend.app.api.phase1 import (
    analyze_gaps,
    compile_gherkin,
    finalize_stories,
    generate_clarifying_questions,
    generate_nl_stories,
)
from backend.app.main import health
from backend.app.schemas.phase1 import (
    AnalyzeGapsRequest,
    CompileGherkinRequest,
    FinalizeStoriesRequest,
    GenerateClarifyingQuestionsRequest,
    GenerateNlStoriesRequest,
)


class StubPhase1Service:
    def __init__(self):
        self.last_ctx = None

    def generate_nl_stories(self, ctx, *, epic_subject, epic_description, hint="", instructions="", figma_token=""):
        self.last_ctx = ctx
        self.last_figma_token = figma_token
        return f"[S] {epic_subject}", 1

    def compile_gherkin(self, *, nl_draft, clarifications=None):
        self.last_clarifications = clarifications
        return [{"title": "Story A", "size": "S", "gherkin": "Feature: A"}]

    def generate_clarifying_questions(self, ctx, *, epic_subject, epic_description="", nl_draft, hint=""):
        self.last_ctx = ctx
        return [{"id": "Q1", "question": "What happens on timeout?", "rationale": "Unclear."}]

    def analyze_gaps(self, ctx, *, existing_epics, hint=""):
        self.last_ctx = ctx
        return {"assessment": "ok", "gaps": [
            {"title": "Notifications", "kind": "missing_epic", "importance": "critical",
             "rationale": "r", "suggested_stories": ["s"]},
        ]}

    def finalize_stories(self, ctx, *, epic_id, epic_subject, stories, clarifications=None):
        self.last_ctx = ctx
        self.last_clarifications = clarifications
        return {
            "ok": True,
            "epic_id": epic_id,
            "count": len(stories),
            "story_ids": [story["id"] for story in stories],
            "story_urls": [],
        }


def _ctx():
    return get_request_context(
        authorization="Bearer tok",
        project_id_new=42,
    )


def test_health_endpoint_function():
    assert health() == {"status": "ok"}


def test_request_context_requires_auth_header():
    with pytest.raises(HTTPException) as exc:
        get_request_context(authorization="", project_id_new=42)

    assert exc.value.status_code == 401


def test_request_context_requires_project_header():
    with pytest.raises(HTTPException) as exc:
        get_request_context(authorization="Bearer tok", project_id_new=None)

    assert exc.value.status_code == 400


def test_request_context_parses_headers():
    ctx = _ctx()

    assert ctx.pm_token == "tok"
    assert ctx.project_id == 42


def test_generate_nl_stories_route():
    response = generate_nl_stories(
        GenerateNlStoriesRequest(epic_subject="Login", epic_description="Scope", hint=""),
        ctx=_ctx(),
        service=StubPhase1Service(),
        x_figma_token="",
    )

    assert response == {"nl_draft": "[S] Login", "story_count": 1}


def test_analyze_gaps_route():
    response = analyze_gaps(
        AnalyzeGapsRequest(
            existing_epics=[{"title": "Auth", "description": "login", "stories": ["Sign in"]}],
            hint="mobile",
        ),
        ctx=_ctx(),
        service=StubPhase1Service(),
        _rl=None,
    )

    assert response["assessment"] == "ok"
    assert response["gaps"][0]["kind"] == "missing_epic"
    assert response["gaps"][0]["importance"] == "critical"


def test_generate_clarifying_questions_route():
    service = StubPhase1Service()
    response = generate_clarifying_questions(
        GenerateClarifyingQuestionsRequest(epic_subject="Login", nl_draft="Draft"),
        ctx=_ctx(),
        service=service,
        _rl=None,
    )

    assert response["questions"][0]["question"] == "What happens on timeout?"
    assert service.last_ctx is not None


def test_compile_gherkin_route_does_not_need_request_context():
    response = compile_gherkin(
        CompileGherkinRequest(nl_draft="Draft"),
        service=StubPhase1Service(),
    )

    assert response["stories"][0]["title"] == "Story A"


def test_compile_gherkin_route_forwards_clarifications():
    service = StubPhase1Service()
    compile_gherkin(
        CompileGherkinRequest(nl_draft="Draft", clarifications=[{"question": "Q", "answer": "A"}]),
        service=service,
    )

    assert service.last_clarifications == [{"question": "Q", "answer": "A"}]


def test_compile_gherkin_route_carries_assumptions():
    class AssumptionStub(StubPhase1Service):
        def compile_gherkin(self, *, nl_draft, clarifications=None):
            return [{
                "title": "Story A", "size": "S", "gherkin": "Feature: A",
                "assumptions": ["Login: assumed session lasts 24h"],
            }]

    response = compile_gherkin(
        CompileGherkinRequest(nl_draft="Draft"),
        service=AssumptionStub(),
    )

    assert response["stories"][0]["assumptions"] == ["Login: assumed session lasts 24h"]


def test_finalize_stories_route():
    response = finalize_stories(
        FinalizeStoriesRequest(
            epic_id=10,
            epic_subject="Epic",
            stories=[{"id": 100, "title": "Story", "gherkin": "Feature: Story"}],
        ),
        ctx=_ctx(),
        service=StubPhase1Service(),
    )

    assert response["epic_id"] == 10
    assert response["story_ids"] == [100]


def test_finalize_stories_route_forwards_clarifications():
    service = StubPhase1Service()
    finalize_stories(
        FinalizeStoriesRequest(
            epic_id=10,
            epic_subject="Epic",
            stories=[{"id": 100, "title": "Story", "gherkin": "Feature: Story"}],
            clarifications=[{"question": "Q", "answer": "A"}],
        ),
        ctx=_ctx(),
        service=service,
    )

    assert service.last_clarifications == [{"question": "Q", "answer": "A"}]
