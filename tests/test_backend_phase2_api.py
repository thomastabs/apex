"""API route tests for Phase 2 FastAPI routes."""

import pytest
from fastapi import HTTPException

from backend.app.api.deps import get_request_context
from backend.app.api.phase2 import (
    generate_design_section,
    generate_diagram,
    get_diagram,
    lock_tech_stack,
    persist_design,
    propose_tech_stack,
    save_diagram_positions,
    tech_stack_status,
)
from backend.app.schemas.phase2 import (
    DesignSectionRequest,
    GenerateDiagramRequest,
    LockDesignRequest,
    LockTechStackRequest,
    ProposeTechStackRequest,
    SaveDiagramPositionsRequest,
)
from src.ai_engine import AIError, AIRateLimitError


class StubPhase2Service:
    def configure_request(self, ctx):
        if hasattr(self, "context"):
            self.context.set_project(ctx.project_id)

    def tech_stack_status(self, ctx):
        return {"defined": True, "tech_stack": "FastAPI"}

    def propose_tech_stack(self, ctx, *, hint=""):
        return [{"name": "FastAPI", "description": hint or "Good", "trade_offs": "+ simple"}]

    def lock_tech_stack(self, ctx, *, tech_stack):
        return {"defined": True, "tech_stack": tech_stack}

    def generate_design_section(self, ctx, *, section, prior_sections=None):
        return {
            "section": section,
            "content": {
                "ux_brief":   "## Screens\n- Login",
                "endpoints":  "## Endpoints\n- POST /auth",
                "data_model": "## Data Model\n### User",
            }[section],
            "story_ids": [10],
        }

    def persist_design(self, ctx, *, story_ids, ux_brief, endpoints, data_model):
        self.configure_request(ctx)
        self.context.write_project_design_bundle(ux_brief, endpoints, data_model)
        self.context.write_project_technical_spec(story_ids, endpoints)
        return {"ok": True, "story_ids": story_ids, "taiga_failures": []}

    def load_diagram(self, ctx):
        return None

    def generate_diagram(self, ctx, *, data_model_md):
        return {
            "nodes": [{"id": "user", "type": "entity", "position": {"x": 0, "y": 0}, "data": {"label": "User", "fields": []}}],
            "edges": [],
        }

    def save_diagram_positions(self, ctx, *, nodes):
        pass


def _ctx():
    return get_request_context("Bearer tok", 42)


def test_tech_stack_status_route():
    assert tech_stack_status(ctx=_ctx(), service=StubPhase2Service()) == {
        "defined": True,
        "tech_stack": "FastAPI",
    }


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


def test_generate_design_section_route_ux_brief():
    response = generate_design_section(
        DesignSectionRequest(section="ux_brief"),
        ctx=_ctx(),
        service=StubPhase2Service(),
    )

    assert response["section"] == "ux_brief"
    assert "Screens" in response["content"]
    assert response["story_ids"] == [10]


def test_generate_design_section_route_with_prior():
    response = generate_design_section(
        DesignSectionRequest(section="data_model", prior={"endpoints": "## Endpoints\n- POST /auth"}),
        ctx=_ctx(),
        service=StubPhase2Service(),
    )

    assert response["section"] == "data_model"
    assert "Data Model" in response["content"]


def test_persist_design_route():
    class Context:
        def __init__(self):
            self.project_id = None
            self.design = None
            self.spec = None

        def set_project(self, project_id):
            self.project_id = project_id

        def write_project_design_bundle(self, ux_brief: str, endpoints: str, data_model: str) -> None:
            self.design = (ux_brief, endpoints, data_model)

        def write_project_technical_spec(self, story_ids, spec):
            self.spec = (story_ids, spec)

    service = StubPhase2Service()
    service.context = Context()

    response = persist_design(
        LockDesignRequest(
            story_ids=[10],
            ux_brief="## Screens\n- Login",
            endpoints="## Endpoints\n- POST /auth",
            data_model="## Data Model\n### User",
        ),
        ctx=_ctx(),
        service=service,
    )

    assert response == {"ok": True, "story_ids": [10], "taiga_failures": []}
    assert service.context.project_id == 42
    assert service.context.spec == ([10], "## Endpoints\n- POST /auth")


def test_phase2_validation_errors_map_to_422():
    class FailingService(StubPhase2Service):
        def tech_stack_status(self, ctx):
            from backend.app.services.phase2_service import Phase2ValidationError
            raise Phase2ValidationError("Missing stack")

    with pytest.raises(HTTPException) as exc:
        tech_stack_status(ctx=_ctx(), service=FailingService())

    assert exc.value.status_code == 422


def test_ai_error_maps_to_502():
    class FailingService(StubPhase2Service):
        def propose_tech_stack(self, ctx, *, hint=""):
            raise AIError("Model overloaded")

    with pytest.raises(HTTPException) as exc:
        propose_tech_stack(ProposeTechStackRequest(), ctx=_ctx(), service=FailingService())

    assert exc.value.status_code == 502


def test_ai_rate_limit_error_maps_to_429():
    class FailingService(StubPhase2Service):
        def generate_design_section(self, ctx, *, section, prior_sections=None):
            raise AIRateLimitError("Rate limited")

    with pytest.raises(HTTPException) as exc:
        generate_design_section(
            DesignSectionRequest(section="ux_brief"),
            ctx=_ctx(),
            service=FailingService(),
        )

    assert exc.value.status_code == 429


def test_get_diagram_returns_none_when_missing():
    assert get_diagram(ctx=_ctx(), service=StubPhase2Service()) is None


def test_generate_diagram_route():
    result = generate_diagram(
        GenerateDiagramRequest(data_model_md="### User\n- id: UUID (PK)"),
        ctx=_ctx(),
        service=StubPhase2Service(),
    )
    assert len(result["nodes"]) == 1
    assert result["nodes"][0]["id"] == "user"
    assert result["edges"] == []


def test_save_diagram_positions_route():
    result = save_diagram_positions(
        SaveDiagramPositionsRequest(nodes=[{"id": "user", "position": {"x": 100, "y": 200}}]),
        ctx=_ctx(),
        service=StubPhase2Service(),
    )
    assert result == {"ok": True}


def test_unknown_errors_bubble_up():
    class FailingService(StubPhase2Service):
        def lock_tech_stack(self, ctx, *, tech_stack):
            raise RuntimeError("unexpected crash")

    with pytest.raises(RuntimeError, match="unexpected crash"):
        lock_tech_stack(LockTechStackRequest(tech_stack="X"), ctx=_ctx(), service=FailingService())
