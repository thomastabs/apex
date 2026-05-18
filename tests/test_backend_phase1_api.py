"""API route tests for the migrated Phase 1 FastAPI backend."""

import pytest
from fastapi import HTTPException

from backend.app.api.deps import get_request_context
from backend.app.api.phase1 import (
    compile_gherkin,
    generate_nl_stories,
    list_epics,
    push_stories,
)
from backend.app.main import health
from backend.app.schemas.phase1 import (
    CompileGherkinRequest,
    GenerateNlStoriesRequest,
    PushStoriesRequest,
)


class StubPhase1Service:
    def __init__(self):
        self.last_ctx = None

    def list_epics(self, ctx):
        self.last_ctx = ctx
        return [{"id": 1, "ref": 9, "subject": "Epic", "description": "", "tags": []}]

    def generate_nl_stories(self, ctx, *, epic_subject, epic_description, hint=""):
        self.last_ctx = ctx
        return f"[S] {epic_subject}", 1

    def compile_gherkin(self, *, nl_draft):
        return [{"title": "Story A", "size": "S", "gherkin": "Feature: A"}]

    def push_stories(self, ctx, *, epic_subject, epic_description, epic_id, stories):
        self.last_ctx = ctx
        return {
            "ok": True,
            "epic_id": epic_id or 10,
            "count": len(stories),
            "story_ids": [100],
            "story_urls": ["https://taiga.test/us/1"],
        }


def _ctx():
    return get_request_context(
        authorization="Bearer tok",
        project_id=42,
    )


def test_health_endpoint_function():
    assert health() == {"status": "ok"}


def test_request_context_requires_auth_header():
    with pytest.raises(HTTPException) as exc:
        get_request_context(authorization="", project_id=42)

    assert exc.value.status_code == 401


def test_request_context_requires_project_header():
    with pytest.raises(HTTPException) as exc:
        get_request_context(authorization="Bearer tok", project_id=None)

    assert exc.value.status_code == 400


def test_request_context_parses_headers():
    ctx = _ctx()

    assert ctx.taiga_token == "tok"
    assert ctx.project_id == 42


def test_epics_route_passes_request_context_to_service():
    service = StubPhase1Service()

    response = list_epics(ctx=_ctx(), service=service)

    assert response[0]["subject"] == "Epic"
    assert service.last_ctx.taiga_token == "tok"
    assert service.last_ctx.project_id == 42


def test_generate_nl_stories_route():
    response = generate_nl_stories(
        GenerateNlStoriesRequest(epic_subject="Login", epic_description="Scope", hint=""),
        ctx=_ctx(),
        service=StubPhase1Service(),
    )

    assert response == {"nl_draft": "[S] Login", "story_count": 1}


def test_compile_gherkin_route_does_not_need_request_context():
    response = compile_gherkin(
        CompileGherkinRequest(nl_draft="Draft"),
        service=StubPhase1Service(),
    )

    assert response["stories"][0]["title"] == "Story A"


def test_push_stories_route():
    response = push_stories(
        PushStoriesRequest(
            epic_subject="Epic",
            stories=[{"title": "Story", "size": "S", "gherkin": "Feature: Story"}],
        ),
        ctx=_ctx(),
        service=StubPhase1Service(),
    )

    assert response["story_ids"] == [100]
