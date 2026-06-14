"""API route tests for Phase 4 FastAPI routes."""

import inspect
import re

import pytest
from fastapi import HTTPException

from backend.app.api.deps import get_request_context
from backend.app.api.phase4 import (
    eligible_stories,
    fail_gate,
    generate_bug_report,
    generate_test_plan,
    get_test_plan,
    list_test_plans,
    pass_gate,
    save_test_plan,
    story_context,
)
from backend.app.schemas.phase4 import (
    FailedScenario,
    FailGateRequest,
    GenerateBugReportRequest,
    GenerateTestPlanRequest,
    PassGateRequest,
    SaveTestPlanRequest,
    StoryContextResponse,
)
from src.ai_engine import AIError, AIRateLimitError, AITimeoutError


_FAKE_TEST_PLAN = "## Scenario: Successful login\n\n### Test Steps\n1. Open login page.\n"

_FAKE_BUG_REPORT = "## Bug Summary\nLogin returns 500.\n\n## Fix-Bolt Brief\nPatch login.\n"


class StubPhase4Service:
    def __init__(self):
        self.fail_gate_args = None

    def configure_request(self, ctx):
        pass

    def get_eligible_stories(self, ctx):
        return [
            {
                "story_id": 10,
                "title": "User Login",
                "epic_title": "Auth",
                "gherkin_preview": "Feature: Login",
                "has_bdd": False,
                "has_bug_report": False,
                "is_regression_bypass": False,
            }
        ]

    def get_story_context(self, ctx, story_id):
        return {
            "story_id": story_id,
            "title": "User Login",
            "epic_title": "Auth",
            "gherkin": "Feature: Login",
            "technical_spec": "POST /auth/login",
            "tech_stack": "FastAPI",
        }

    def generate_test_plan(self, ctx, story_id):
        return _FAKE_TEST_PLAN

    def save_test_plan(self, ctx, story_id, test_plan_md):
        pass

    def load_test_plan(self, ctx, story_id):
        return _FAKE_TEST_PLAN

    def list_all_test_plans(self, ctx):
        return [{"story_id": 10, "title": "User Login", "chars": len(_FAKE_TEST_PLAN)}]

    def generate_bug_report(self, ctx, story_id, failed_scenarios):
        return _FAKE_BUG_REPORT

    def pass_gate(self, ctx, story_id, scenario_results=None):
        self.pass_gate_args = (story_id, scenario_results)

    def fail_gate(self, ctx, story_id, bug_report_md, root_cause, resolution_summary,
                  scenario_results=None):
        self.fail_gate_args = (story_id, bug_report_md, root_cause, resolution_summary)
        self.fail_gate_scenario_results = scenario_results


def _ctx():
    return get_request_context("Bearer tok", 42)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

def test_eligible_stories_route():
    result = eligible_stories(ctx=_ctx(), service=StubPhase4Service())
    assert len(result["stories"]) == 1
    assert result["stories"][0]["story_id"] == 10


def test_story_context_route():
    result = story_context(story_id=10, ctx=_ctx(), service=StubPhase4Service())
    assert result["story_id"] == 10
    assert result["gherkin"] == "Feature: Login"
    assert result["tech_stack"] == "FastAPI"


def test_story_context_schema_has_no_task_list():
    """Regression for commit 6147855: the task-list store was removed; the
    response schema must not advertise a field the service no longer fills."""
    assert "task_list" not in StoryContextResponse.model_fields


def test_generate_test_plan_route():
    result = generate_test_plan(
        GenerateTestPlanRequest(story_id=10),
        ctx=_ctx(),
        service=StubPhase4Service(),
        _rl=None,
    )
    assert result["story_id"] == 10
    assert "## Scenario:" in result["test_plan_md"]


def test_save_test_plan_route():
    result = save_test_plan(
        SaveTestPlanRequest(story_id=10, test_plan_md=_FAKE_TEST_PLAN),
        ctx=_ctx(),
        service=StubPhase4Service(),
    )
    assert result == {"ok": True}


def test_get_test_plan_route():
    result = get_test_plan(story_id=10, ctx=_ctx(), service=StubPhase4Service())
    assert result["story_id"] == 10
    assert result["test_plan_md"] == _FAKE_TEST_PLAN


def test_list_test_plans_route():
    result = list_test_plans(ctx=_ctx(), service=StubPhase4Service())
    assert len(result["test_plans"]) == 1
    assert result["test_plans"][0]["story_id"] == 10
    assert result["test_plans"][0]["chars"] == len(_FAKE_TEST_PLAN)


def test_generate_bug_report_route():
    result = generate_bug_report(
        GenerateBugReportRequest(
            story_id=10,
            failed_scenarios=[FailedScenario(scenario_name="Successful login", qa_notes="500 error")],
        ),
        ctx=_ctx(),
        service=StubPhase4Service(),
        _rl=None,
    )
    assert result["story_id"] == 10
    assert "## Bug Summary" in result["bug_report_md"]


def test_generate_bug_report_requires_at_least_one_scenario():
    with pytest.raises(Exception):  # Pydantic ValidationError (min_length=1)
        GenerateBugReportRequest(story_id=10, failed_scenarios=[])


def test_pass_gate_route():
    svc = StubPhase4Service()
    result = pass_gate(PassGateRequest(story_id=10), ctx=_ctx(), service=svc)
    assert result == {"ok": True}
    # Bare {story_id} body (no scenario_results) must remain accepted.
    assert svc.pass_gate_args == (10, None)


def test_pass_gate_route_forwards_scenario_results():
    svc = StubPhase4Service()
    payload = PassGateRequest(
        story_id=10,
        scenario_results=[{"scenario": "Successful login", "result": "pass", "notes": ""}],
    )
    result = pass_gate(payload, ctx=_ctx(), service=svc)
    assert result == {"ok": True}
    assert svc.pass_gate_args[1] == [
        {"scenario": "Successful login", "result": "pass", "notes": ""}
    ]


def test_fail_gate_route_passes_all_fields():
    svc = StubPhase4Service()
    result = fail_gate(
        FailGateRequest(
            story_id=10,
            bug_report_md=_FAKE_BUG_REPORT,
            root_cause="Missing null check",
            resolution_summary="Added validation",
        ),
        ctx=_ctx(),
        service=svc,
    )
    assert result == {"ok": True}
    assert svc.fail_gate_args == (10, _FAKE_BUG_REPORT, "Missing null check", "Added validation")


# ---------------------------------------------------------------------------
# Error mapping
# ---------------------------------------------------------------------------

def test_phase4_validation_error_maps_to_422():
    class FailingService(StubPhase4Service):
        def get_story_context(self, ctx, story_id):
            from backend.app.services.phase4_service import Phase4ValidationError
            raise Phase4ValidationError("Story not found")

    with pytest.raises(HTTPException) as exc:
        story_context(story_id=999, ctx=_ctx(), service=FailingService())
    assert exc.value.status_code == 422


def test_ai_rate_limit_error_maps_to_429():
    class FailingService(StubPhase4Service):
        def generate_test_plan(self, ctx, story_id):
            raise AIRateLimitError("Rate limited")

    with pytest.raises(HTTPException) as exc:
        generate_test_plan(
            GenerateTestPlanRequest(story_id=10), ctx=_ctx(), service=FailingService(), _rl=None,
        )
    assert exc.value.status_code == 429


def test_ai_timeout_error_maps_to_504():
    class FailingService(StubPhase4Service):
        def generate_test_plan(self, ctx, story_id):
            raise AITimeoutError("LLM timed out")

    with pytest.raises(HTTPException) as exc:
        generate_test_plan(
            GenerateTestPlanRequest(story_id=10), ctx=_ctx(), service=FailingService(), _rl=None,
        )
    assert exc.value.status_code == 504


def test_ai_error_maps_to_502():
    class FailingService(StubPhase4Service):
        def generate_bug_report(self, ctx, story_id, failed_scenarios):
            raise AIError("Model overloaded")

    with pytest.raises(HTTPException) as exc:
        generate_bug_report(
            GenerateBugReportRequest(
                story_id=10,
                failed_scenarios=[FailedScenario(scenario_name="X", qa_notes="")],
            ),
            ctx=_ctx(),
            service=FailingService(),
            _rl=None,
        )
    assert exc.value.status_code == 502


def test_unknown_errors_bubble_up():
    class FailingService(StubPhase4Service):
        def get_eligible_stories(self, ctx):
            raise RuntimeError("unexpected crash")

    with pytest.raises(RuntimeError, match="unexpected crash"):
        eligible_stories(ctx=_ctx(), service=FailingService())


# ---------------------------------------------------------------------------
# Contract: ContextService must only call functions that still exist
# ---------------------------------------------------------------------------

def test_context_service_only_delegates_to_existing_functions():
    """Guards against refactors deleting context_manager functions that
    ContextService still wraps (the commit-6147855 failure mode).
    context_manager.__getattr__ masks these at import time, so check explicitly.
    """
    from backend.app.services.context_service import ContextService
    from src import context_manager

    source = inspect.getsource(ContextService)
    called = sorted(set(re.findall(r"context_manager\.(\w+)\(", source)))
    assert called, "expected ContextService to delegate to context_manager"
    missing = [name for name in called if not hasattr(context_manager, name)]
    assert not missing, f"ContextService delegates to deleted context_manager functions: {missing}"
