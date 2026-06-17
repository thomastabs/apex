"""End-to-end phase-continuity tests.

Unlike the per-phase suites, these drive a single story through the whole
phase_status state machine (new → gherkin_locked → design_locked →
implementation → qa_passed → deployed) and the Phase 6 maintenance loop, then
assert every gate rejects an out-of-order story. Covers both layers: the
service classes directly (the bulk of the matrix) and a thin TestClient smoke
proving the PhaseNValidationError → HTTP 422 wiring.

The AI is replaced by `FakeAi` (a duck-typed AiService); storage is the
isolated tmp disk from the `ctx` fixture in conftest.py. Auth/network are
bypassed by the autouse `_bypass_pm_auth` fixture.
"""

import pytest

from backend.app.api.deps import get_request_context
from backend.app.services.context_service import ContextService
from backend.app.services.maintenance_service import (
    MaintenanceService,
    MaintenanceValidationError,
)
from backend.app.services.phase1_service import Phase1Service, Phase1ValidationError
from backend.app.services.phase2_service import Phase2Service, Phase2ValidationError
from backend.app.services.phase3_service import Phase3Service, Phase3ValidationError
from backend.app.services.phase4_service import Phase4Service
from backend.app.services.phase5_service import Phase5Service, Phase5ValidationError

PID = 4242
GHERKIN = "Feature: Login\n  Scenario: ok\n    Given a user\n    When they log in\n    Then access\n"


class FakeAi:
    """Deterministic stand-in for AiService — only the methods the walk hits."""

    def generate_tasks(self, *a, **k):
        return [
            {
                "id": 1,
                "subject": "Build endpoint",
                "description": "...",
                "effort_estimate": "S",
                "covered_scenarios": ["ok"],
                "predecessor_task_ids": [],
            }
        ]

    def generate_proposal(self, *a, **k):
        return "## Proposal\nDo the thing."

    def generate_test_plan(self, *a, **k):
        return "## Test Plan\n- Scenario ok\n"

    def generate_infra_delta(self, *a, **k):
        # Routine deployment: no infra change → deploy-pack bypass.
        return {"needs_infra_change": False, "deltas": [], "summary": "no infra change"}

    def triage_feedback(self, *a, **k):
        return {"classification": "bug", "rationale": "regression", "severity_hint": "low"}

    def diagnose_bug(self, *a, **k):
        return "Root cause: off-by-one in the gate."

    def suggest_severity_lane(self, *a, **k):
        return {"lane": "secure", "rationale": "touches auth", "confidence": "high"}


# ── helpers ──────────────────────────────────────────────────────────────────


def _req():
    return get_request_context(authorization="Bearer t", project_id_new=PID)


def status_of(ctx, story_id):
    cs = ContextService()
    cs.set_active(ctx)
    return cs.story_index().get(str(story_id), {}).get("phase_status")


def _finalize(ctx, story_id, gherkin=GHERKIN):
    Phase1Service(ai=FakeAi()).finalize_stories(
        ctx,
        epic_id=1,
        epic_subject="Epic",
        stories=[{"id": story_id, "title": f"Story {story_id}", "gherkin": gherkin}],
    )


def _to_design_locked(ctx, story_id):
    _finalize(ctx, story_id)
    p2 = Phase2Service(ai=FakeAi())
    p2.lock_tech_stack(ctx, tech_stack="Python · FastAPI")
    p2.persist_design(
        ctx, story_ids=[story_id], ux_brief="UX", endpoints="GET /x", data_model="User"
    )


def _to_implementation(ctx, story_id):
    _to_design_locked(ctx, story_id)
    p3 = Phase3Service(ai=FakeAi())
    tasks = p3.generate_tasks(ctx, story_id)
    for t in tasks:
        p3.save_proposal(ctx, story_id, t["id"], "proposal md")
    p3.lock_story(ctx, story_id, [t["id"] for t in tasks])


def _to_qa_passed(ctx, story_id):
    _to_implementation(ctx, story_id)
    p4 = Phase4Service(ai=FakeAi())
    p4.save_test_plan(ctx, story_id, p4.generate_test_plan(ctx, story_id))
    p4.pass_gate(ctx, story_id)


def _to_deployed(ctx, story_id):
    _to_qa_passed(ctx, story_id)
    p5 = Phase5Service(ai=FakeAi())
    p5.save_infra_delta(ctx, story_id, p5.generate_infra_delta(ctx, story_id))
    p5.pass_deployment_gate(ctx, story_id, tech_lead_approved=True, devops_approved=True)


# ── Test 1: happy path through every phase (service layer) ───────────────────


def test_story_walks_phase1_through_deployment(ctx):
    rc = _req()
    sid = 101

    # Phase 1 — Gherkin locked.
    _finalize(rc, sid)
    assert status_of(rc, sid) == "gherkin_locked"

    # Phase 2 — project-wide design locked.
    p2 = Phase2Service(ai=FakeAi())
    p2.lock_tech_stack(rc, tech_stack="Python · FastAPI")
    p2.persist_design(rc, story_ids=[sid], ux_brief="UX", endpoints="GET /x", data_model="User")
    assert status_of(rc, sid) == "design_locked"

    # Phase 3 — tasks + packs → implementation.
    p3 = Phase3Service(ai=FakeAi())
    tasks = p3.generate_tasks(rc, sid)
    for t in tasks:
        p3.save_proposal(rc, sid, t["id"], "proposal md")
    p3.lock_story(rc, sid, [t["id"] for t in tasks])
    assert status_of(rc, sid) == "implementation"

    # Phase 4 — test plan + gate → qa_passed.
    p4 = Phase4Service(ai=FakeAi())
    p4.save_test_plan(rc, sid, p4.generate_test_plan(rc, sid))
    p4.pass_gate(rc, sid)
    assert status_of(rc, sid) == "qa_passed"

    # Phase 5 — infra delta (bypass) + two-party gate → deployed.
    p5 = Phase5Service(ai=FakeAi())
    p5.save_infra_delta(rc, sid, p5.generate_infra_delta(rc, sid))
    p5.pass_deployment_gate(rc, sid, tech_lead_approved=True, devops_approved=True)
    assert status_of(rc, sid) == "deployed"


def test_phase6_maintenance_routes_back_into_the_loop(ctx):
    rc = _req()
    sid = 201
    _to_deployed(rc, sid)
    assert status_of(rc, sid) == "deployed"

    m = MaintenanceService(ai=FakeAi())

    # Fast Lane — low-risk fix-bolt keeps the story deployed (QA bypassed).
    fast = m.create_item(rc, subject="Typo", description="cosmetic", linked_story_id=sid)
    m.route_lane(rc, fast["id"], "fast")
    assert status_of(rc, sid) == "deployed"

    # Secure Lane — high-risk bug routes the story back to implementation.
    bug = m.create_item(rc, subject="Auth bug", description="broken", linked_story_id=sid)
    m.classify(rc, bug["id"])
    m.diagnose(rc, bug["id"])
    assert m.suggest_lane(rc, bug["id"])["lane"] == "secure"
    m.route_lane(rc, bug["id"], "secure")
    assert status_of(rc, sid) == "implementation"


# ── Test 2: bad paths — every gate rejects an out-of-order story ─────────────


def test_phase1_rejects_gherkin_without_scenario(ctx):
    with pytest.raises(Phase1ValidationError):
        _finalize(_req(), 301, gherkin="Feature: X\n  (no scenario here)\n")


def test_phase2_rejects_empty_story_ids(ctx):
    rc = _req()
    Phase2Service(ai=FakeAi()).lock_tech_stack(rc, tech_stack="Python")
    with pytest.raises(Phase2ValidationError):
        Phase2Service(ai=FakeAi()).persist_design(
            rc, story_ids=[], ux_brief="UX", endpoints="e", data_model="d"
        )


def test_phase3_rejects_tasks_before_design_locked(ctx):
    rc = _req()
    sid = 311
    _finalize(rc, sid)  # only gherkin_locked
    with pytest.raises(Phase3ValidationError):
        Phase3Service(ai=FakeAi()).generate_tasks(rc, sid)


def test_phase3_lock_rejects_story_not_design_locked(ctx):
    rc = _req()
    sid = 312
    _finalize(rc, sid)
    with pytest.raises(Phase3ValidationError):
        Phase3Service(ai=FakeAi()).lock_story(rc, sid, [1])


def test_phase5_gate_requires_both_sign_offs(ctx):
    rc = _req()
    sid = 321
    _to_qa_passed(rc, sid)
    p5 = Phase5Service(ai=FakeAi())
    p5.save_infra_delta(rc, sid, p5.generate_infra_delta(rc, sid))
    with pytest.raises(Phase5ValidationError):
        p5.pass_deployment_gate(rc, sid, tech_lead_approved=True, devops_approved=False)
    assert status_of(rc, sid) == "qa_passed"  # unchanged


def test_phase5_rejects_story_not_qa_passed(ctx):
    rc = _req()
    sid = 322
    _to_implementation(rc, sid)  # only implementation, not qa_passed
    with pytest.raises(Phase5ValidationError):
        Phase5Service(ai=FakeAi()).generate_infra_delta(rc, sid)


def test_phase5_gate_requires_deploy_pack_when_infra_changes(ctx):
    rc = _req()
    sid = 323
    _to_qa_passed(rc, sid)
    p5 = Phase5Service(ai=FakeAi())
    # Infra change flagged but no deploy pack saved → gate must refuse.
    p5.save_infra_delta(rc, sid, {"needs_infra_change": True, "deltas": [{"item": "add DB"}]})
    with pytest.raises(Phase5ValidationError):
        p5.pass_deployment_gate(rc, sid, tech_lead_approved=True, devops_approved=True)
    assert status_of(rc, sid) == "qa_passed"


def test_maintenance_rejects_unknown_linked_story(ctx):
    with pytest.raises(MaintenanceValidationError):
        MaintenanceService(ai=FakeAi()).create_item(
            _req(), subject="x", linked_story_id=99999
        )


# ── Test 3: HTTP layer smoke — gate failures surface as 422 ──────────────────


def test_http_lock_story_happy_and_out_of_order(ctx):
    from fastapi.testclient import TestClient

    from backend.app.api.phase3 import get_phase3_service
    from backend.app.main import app

    app.dependency_overrides[get_phase3_service] = lambda: Phase3Service(ai=FakeAi())
    headers = {"Authorization": "Bearer t", "X-Project-Id": str(PID)}
    rc = _req()
    try:
        client = TestClient(app)

        # Happy: a design_locked story with a saved pack locks → 200, implementation.
        ok_sid = 401
        _to_design_locked(rc, ok_sid)
        Phase3Service(ai=FakeAi()).save_proposal(rc, ok_sid, 1, "proposal md")
        resp = client.post(
            "/api/phase3/lock-story",
            json={"story_id": ok_sid, "task_ids": [1]},
            headers=headers,
        )
        assert resp.status_code == 200
        assert status_of(rc, ok_sid) == "implementation"

        # Out of order: a gherkin_locked story is not lockable → 422.
        bad_sid = 402
        _finalize(rc, bad_sid)
        resp = client.post(
            "/api/phase3/lock-story",
            json={"story_id": bad_sid, "task_ids": [1]},
            headers=headers,
        )
        assert resp.status_code == 422
        assert status_of(rc, bad_sid) == "gherkin_locked"  # unchanged
    finally:
        app.dependency_overrides.pop(get_phase3_service, None)
