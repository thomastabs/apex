"""API route tests for migrated Phase 2 FastAPI routes."""

import pytest
from fastapi import HTTPException

from backend.app.api.deps import get_request_context
from backend.app.api.phase2 import (
    eligible_epics,
    generate_design_bundle,
    lock_epic_design,
    lock_tech_stack,
    propose_tech_stack,
    tech_stack_status,
)
from backend.app.schemas.phase2 import (
    GenerateDesignBundleRequest,
    LockEpicDesignRequest,
    LockTechStackRequest,
    ProposeTechStackRequest,
)
from src.ai_engine import AIError, AIRateLimitError
from src.taiga_adapter import TaigaAPIError


class StubPhase2Service:
    def tech_stack_status(self, ctx):
        return {"defined": True, "tech_stack": "FastAPI"}

    def eligible_epics(self, ctx):
        return [{"epic_id": 7, "epic_title": "Auth", "story_count": 2, "phase_status": "gherkin_locked"}]

    def propose_tech_stack(self, ctx, *, hint=""):
        return [{"name": "FastAPI", "description": hint or "Good", "trade_offs": "+ simple"}]

    def lock_tech_stack(self, ctx, *, tech_stack):
        return {"defined": True, "tech_stack": tech_stack}

    def generate_design_bundle(self, ctx, *, epic_id):
        return {
            "wireframes": "SCREEN",
            "user_flow": "flowchart TD",
            "component_tree": "App",
            "tech_spec": "openapi: 3.0.0",
            "story_ids": [10],
        }

    def lock_epic_design(
        self,
        ctx,
        *,
        epic_id,
        epic_title,
        story_ids,
        wireframes,
        user_flow,
        component_tree,
        tech_spec,
    ):
        return {"ok": True, "epic_id": epic_id, "story_ids": story_ids, "taiga_failures": []}


def _ctx():
    return get_request_context("Bearer tok", 42)


def test_tech_stack_status_route():
    assert tech_stack_status(ctx=_ctx(), service=StubPhase2Service()) == {
        "defined": True,
        "tech_stack": "FastAPI",
    }


def test_eligible_epics_route():
    response = eligible_epics(ctx=_ctx(), service=StubPhase2Service())

    assert response[0]["epic_id"] == 7


def test_propose_tech_stack_route():
    response = propose_tech_stack(
        ProposeTechStackRequest(hint="Python"),
        ctx=_ctx(),
        service=StubPhase2Service(),
    )

    assert response["alternatives"][0]["description"] == "Python"


def test_lock_tech_stack_route():
    response = lock_tech_stack(
        LockTechStackRequest(tech_stack="FastAPI"),
        ctx=_ctx(),
        service=StubPhase2Service(),
    )

    assert response == {"defined": True, "tech_stack": "FastAPI"}


def test_generate_design_bundle_route():
    response = generate_design_bundle(
        GenerateDesignBundleRequest(epic_id=7),
        ctx=_ctx(),
        service=StubPhase2Service(),
    )

    assert response["story_ids"] == [10]
    assert response["wireframes"] == "SCREEN"


def test_lock_epic_design_route():
    response = lock_epic_design(
        LockEpicDesignRequest(
            epic_id=7,
            epic_title="Auth",
            story_ids=[10],
            wireframes="SCREEN",
            user_flow="flowchart TD",
            component_tree="App",
            tech_spec="openapi: 3.0.0",
        ),
        ctx=_ctx(),
        service=StubPhase2Service(),
    )

    assert response == {"ok": True, "epic_id": 7, "story_ids": [10], "taiga_failures": []}


def test_phase2_validation_errors_map_to_422():
    class FailingService(StubPhase2Service):
        def tech_stack_status(self, ctx):
            from backend.app.services.phase2_service import Phase2ValidationError
            raise Phase2ValidationError("Missing stack")

    with pytest.raises(HTTPException) as exc:
        tech_stack_status(ctx=_ctx(), service=FailingService())

    assert exc.value.status_code == 422


def test_taiga_error_maps_to_502():
    class FailingService(StubPhase2Service):
        def eligible_epics(self, ctx):
            raise TaigaAPIError("GET", "https://api.taiga.io/epics", 503, "service unavailable")

    with pytest.raises(HTTPException) as exc:
        eligible_epics(ctx=_ctx(), service=FailingService())

    assert exc.value.status_code == 502


def test_ai_error_maps_to_502():
    class FailingService(StubPhase2Service):
        def propose_tech_stack(self, ctx, *, hint=""):
            raise AIError("Model overloaded")

    with pytest.raises(HTTPException) as exc:
        propose_tech_stack(ProposeTechStackRequest(), ctx=_ctx(), service=FailingService())

    assert exc.value.status_code == 502


def test_ai_rate_limit_error_maps_to_502():
    class FailingService(StubPhase2Service):
        def generate_design_bundle(self, ctx, *, epic_id):
            raise AIRateLimitError("Rate limited")

    with pytest.raises(HTTPException) as exc:
        generate_design_bundle(GenerateDesignBundleRequest(epic_id=7), ctx=_ctx(), service=FailingService())

    assert exc.value.status_code == 502


def test_unknown_errors_bubble_up():
    class FailingService(StubPhase2Service):
        def lock_tech_stack(self, ctx, *, tech_stack):
            raise RuntimeError("unexpected crash")

    with pytest.raises(RuntimeError, match="unexpected crash"):
        lock_tech_stack(LockTechStackRequest(tech_stack="X"), ctx=_ctx(), service=FailingService())
