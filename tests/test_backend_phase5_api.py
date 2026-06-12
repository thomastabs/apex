"""API route tests for Phase 5 FastAPI routes."""

import pytest
from fastapi import HTTPException

from backend.app.api.deps import get_request_context
from backend.app.api.phase5 import (
    eligible_stories,
    generate_deploy_pack,
    generate_infra_delta,
    get_deploy_pack,
    get_infra_delta,
    get_verification,
    pass_deployment_gate,
    qa_results,
    revise_deploy_pack,
    save_deploy_pack,
    save_infra_delta,
    save_verification,
    story_context,
)
from backend.app.schemas.phase5 import (
    GenerateDeployPackRequest,
    GenerateInfraDeltaRequest,
    InfraDeltaItemModel,
    InfraDeltaModel,
    PassDeploymentGateRequest,
    ReviseDeployPackRequest,
    SaveDeployPackRequest,
    SaveInfraDeltaRequest,
    SaveVerificationRequest,
    VerificationMatrix,
    VerificationScenarioRow,
    VerificationSummary,
)
from src.ai_engine import AIError, AIRateLimitError, AITimeoutError


_FAKE_DELTA = {
    "needs_infra_change": True,
    "rationale": "Needs a JWT secret.",
    "deltas": [
        {"category": "secret", "title": "Provision JWT secret",
         "detail": "Add JWT_SECRET env var.", "risk": "high"},
    ],
}

_FAKE_PACK = "## Provision JWT secret\n\n### Script\n```env\nJWT_SECRET=<generate>\n```\n"


class StubPhase5Service:
    def __init__(self):
        self.saved_delta = None
        self.saved_pack = None
        self.gate_args = None
        self.revise_args = None

    def configure_request(self, ctx):
        pass

    def get_eligible_stories(self, ctx):
        return [
            {
                "story_id": 10,
                "title": "User Login",
                "epic_title": "Auth",
                "gherkin_preview": "Feature: Login",
                "has_infra_delta": False,
                "has_deploy_pack": False,
                "deploy_bypass": False,
                "fix_bolt_count": 0,
            }
        ]

    def get_story_context(self, ctx, story_id):
        return {
            "story_id": story_id,
            "title": "User Login",
            "epic_title": "Auth",
            "gherkin": "Feature: Login",
            "technical_spec": "## Endpoints",
            "tech_stack": "FastAPI",
            "github_context_synced": False,
            "has_bug_report": False,
            "fix_bolt_count": 0,
        }

    def generate_infra_delta(self, ctx, story_id):
        return dict(_FAKE_DELTA)

    def save_infra_delta(self, ctx, story_id, delta):
        self.saved_delta = (story_id, delta)

    def load_infra_delta(self, ctx, story_id):
        return dict(_FAKE_DELTA)

    def generate_deploy_pack(self, ctx, story_id):
        return _FAKE_PACK

    def save_deploy_pack(self, ctx, story_id, pack_md):
        self.saved_pack = (story_id, pack_md)

    def load_deploy_pack(self, ctx, story_id):
        return _FAKE_PACK

    def revise_deploy_pack(self, ctx, story_id, pack_md, feedback):
        self.revise_args = (story_id, pack_md, feedback)
        return _FAKE_PACK + "\n<!-- revised -->"

    def pass_deployment_gate(self, ctx, story_id, *, tech_lead_approved,
                             devops_approved, notes=""):
        self.gate_args = (story_id, tech_lead_approved, devops_approved, notes)

    def get_qa_results(self, ctx, story_id):
        return {"story_id": story_id, "attempts": [{"gate": "pass", "results": []}]}

    def save_verification(self, ctx, story_id, matrix):
        self.saved_verification = (story_id, matrix)

    def load_verification(self, ctx, story_id):
        return {"story_id": story_id, "summary": {"total": 1}}


def _ctx():
    return get_request_context("Bearer tok", 42)


def _delta_model() -> InfraDeltaModel:
    return InfraDeltaModel(
        needs_infra_change=True,
        rationale="Needs a JWT secret.",
        deltas=[InfraDeltaItemModel(
            category="secret", title="Provision JWT secret",
            detail="Add JWT_SECRET env var.", risk="high",
        )],
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

def test_eligible_stories_route():
    result = eligible_stories(ctx=_ctx(), service=StubPhase5Service())
    assert result["stories"][0]["story_id"] == 10


def test_story_context_route():
    result = story_context(story_id=10, ctx=_ctx(), service=StubPhase5Service())
    assert result["gherkin"] == "Feature: Login"


def test_generate_infra_delta_route():
    result = generate_infra_delta(
        GenerateInfraDeltaRequest(story_id=10), ctx=_ctx(), service=StubPhase5Service(), _rl=None,
    )
    assert result["delta"]["needs_infra_change"] is True


def test_save_infra_delta_route():
    svc = StubPhase5Service()
    result = save_infra_delta(
        SaveInfraDeltaRequest(story_id=10, delta=_delta_model()), ctx=_ctx(), service=svc,
    )
    assert result == {"ok": True}
    assert svc.saved_delta[0] == 10
    assert svc.saved_delta[1]["deltas"][0]["category"] == "secret"


def test_get_infra_delta_route():
    result = get_infra_delta(story_id=10, ctx=_ctx(), service=StubPhase5Service())
    assert result["delta"]["rationale"] == "Needs a JWT secret."


def test_generate_deploy_pack_route():
    result = generate_deploy_pack(
        GenerateDeployPackRequest(story_id=10), ctx=_ctx(), service=StubPhase5Service(), _rl=None,
    )
    assert "JWT secret" in result["deploy_pack_md"]


def test_save_and_get_deploy_pack_routes():
    svc = StubPhase5Service()
    result = save_deploy_pack(
        SaveDeployPackRequest(story_id=10, deploy_pack_md=_FAKE_PACK), ctx=_ctx(), service=svc,
    )
    assert result == {"ok": True}
    assert svc.saved_pack == (10, _FAKE_PACK)
    loaded = get_deploy_pack(story_id=10, ctx=_ctx(), service=svc)
    assert loaded["deploy_pack_md"] == _FAKE_PACK


def test_revise_deploy_pack_route():
    svc = StubPhase5Service()
    result = revise_deploy_pack(
        ReviseDeployPackRequest(story_id=10, deploy_pack_md=_FAKE_PACK, feedback="Rotate secret."),
        ctx=_ctx(), service=svc, _rl=None,
    )
    assert result["deploy_pack_md"].endswith("<!-- revised -->")
    assert svc.revise_args == (10, _FAKE_PACK, "Rotate secret.")


def test_pass_deployment_gate_route():
    svc = StubPhase5Service()
    result = pass_deployment_gate(
        PassDeploymentGateRequest(
            story_id=10, tech_lead_approved=True, devops_approved=True, notes="ok",
        ),
        ctx=_ctx(), service=svc,
    )
    assert result == {"ok": True}
    assert svc.gate_args == (10, True, True, "ok")


def test_qa_results_route():
    result = qa_results(story_id=10, ctx=_ctx(), service=StubPhase5Service())
    assert result["qa_results"]["attempts"][0]["gate"] == "pass"


def test_save_verification_route():
    svc = StubPhase5Service()
    payload = SaveVerificationRequest(
        story_id=10,
        matrix=VerificationMatrix(
            scenarios=[VerificationScenarioRow(
                scenario="Successful login", tasks=[1], tasks_with_pack=[1],
                qa_result="pass", gaps=[],
            )],
            summary=VerificationSummary(total=1, covered=1, with_pack=1, tested=1, gap_count=0),
            complete=True,
        ),
    )
    result = save_verification(payload, ctx=_ctx(), service=svc)
    assert result == {"ok": True}
    assert svc.saved_verification[1]["complete"] is True


def test_get_verification_route():
    result = get_verification(story_id=10, ctx=_ctx(), service=StubPhase5Service())
    assert result["matrix"]["summary"]["total"] == 1


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------

def test_delta_item_rejects_unknown_category():
    with pytest.raises(Exception):  # Pydantic ValidationError
        InfraDeltaItemModel(category="kubernetes", title="x", detail="y", risk="low")


def test_revise_requires_feedback():
    with pytest.raises(Exception):  # min_length=1
        ReviseDeployPackRequest(story_id=10, deploy_pack_md=_FAKE_PACK, feedback="")


# ---------------------------------------------------------------------------
# Error mapping
# ---------------------------------------------------------------------------

def test_phase5_validation_error_maps_to_422():
    class FailingService(StubPhase5Service):
        def get_story_context(self, ctx, story_id):
            from backend.app.services.phase5_service import Phase5ValidationError
            raise Phase5ValidationError("Story not found")

    with pytest.raises(HTTPException) as exc:
        story_context(story_id=999, ctx=_ctx(), service=FailingService())
    assert exc.value.status_code == 422


def test_ai_rate_limit_error_maps_to_429():
    class FailingService(StubPhase5Service):
        def generate_infra_delta(self, ctx, story_id):
            raise AIRateLimitError("Rate limited")

    with pytest.raises(HTTPException) as exc:
        generate_infra_delta(
            GenerateInfraDeltaRequest(story_id=10), ctx=_ctx(), service=FailingService(), _rl=None,
        )
    assert exc.value.status_code == 429


def test_ai_timeout_error_maps_to_504():
    class FailingService(StubPhase5Service):
        def generate_deploy_pack(self, ctx, story_id):
            raise AITimeoutError("LLM timed out")

    with pytest.raises(HTTPException) as exc:
        generate_deploy_pack(
            GenerateDeployPackRequest(story_id=10), ctx=_ctx(), service=FailingService(), _rl=None,
        )
    assert exc.value.status_code == 504


def test_ai_error_maps_to_502():
    class FailingService(StubPhase5Service):
        def revise_deploy_pack(self, ctx, story_id, pack_md, feedback):
            raise AIError("Model overloaded")

    with pytest.raises(HTTPException) as exc:
        revise_deploy_pack(
            ReviseDeployPackRequest(story_id=10, deploy_pack_md=_FAKE_PACK, feedback="f"),
            ctx=_ctx(), service=FailingService(), _rl=None,
        )
    assert exc.value.status_code == 502


def test_unknown_errors_bubble_up():
    class FailingService(StubPhase5Service):
        def get_eligible_stories(self, ctx):
            raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        eligible_stories(ctx=_ctx(), service=FailingService())
