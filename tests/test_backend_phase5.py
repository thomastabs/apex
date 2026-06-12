"""Tests for the Phase 5 backend service (Deployment Gate)."""

import pytest

from backend.app.services.phase5_service import Phase5Service, Phase5ValidationError
from backend.app.services.request_context import RequestContext


_FAKE_GHERKIN = "Feature: Login\n  Scenario: Successful login\n    Given a registered user\n    When they submit valid credentials\n    Then they receive a JWT token"

_FAKE_TECH_SPEC = "## Endpoints\n- `POST /auth/login` · auth:none · in:{email:str,password:str} · out:{token:str}"

_FAKE_TECH_STACK = "FastAPI + Next.js + PostgreSQL"

_FAKE_DELTA_BYPASS = {
    "needs_infra_change": False,
    "rationale": "Story only adds an endpoint on the existing service.",
    "deltas": [],
}

_FAKE_DELTA_CHANGES = {
    "needs_infra_change": True,
    "rationale": "Login requires a JWT signing secret.",
    "deltas": [
        {
            "category": "secret",
            "title": "Provision JWT signing secret",
            "detail": "Add JWT_SECRET to the backend environment.",
            "risk": "high",
        },
    ],
}

_FAKE_PACK = (
    "## Provision JWT signing secret\n\n"
    "**Category:** secret · **Risk:** high\n\n"
    "### Script\n```env\nJWT_SECRET=<generate>\n```\n\n"
    "## Rollback Plan\n1. Remove JWT_SECRET.\n"
)


class FakeAiService:
    def __init__(self, delta=None):
        self.delta = delta if delta is not None else dict(_FAKE_DELTA_BYPASS)
        self.infra_delta_args = None
        self.deploy_pack_args = None
        self.revise_args = None

    def generate_infra_delta(self, story_subject, gherkin, technical_spec,
                             tech_stack="", github_context=""):
        self.infra_delta_args = (story_subject, gherkin, technical_spec, tech_stack)
        return dict(self.delta)

    def generate_deploy_pack(self, story_subject, infra_delta_md, technical_spec,
                             tech_stack="", github_context=""):
        self.deploy_pack_args = (story_subject, infra_delta_md, technical_spec)
        return _FAKE_PACK

    def revise_deploy_pack(self, current_pack_md, feedback, infra_delta_md=""):
        self.revise_args = (current_pack_md, feedback, infra_delta_md)
        return _FAKE_PACK + "\n<!-- revised -->"


class FakeContextService:
    def __init__(self, index=None):
        self.project_id = 0
        self.index = index if index is not None else _story_index()
        self.saved_delta = None
        self.saved_pack = None
        self.deployment_records = []

    def set_project(self, project_id: int):
        self.project_id = project_id

    def story_index(self):
        return self.index

    def story_gherkin(self, story_id: int) -> str:
        return _FAKE_GHERKIN

    def story_technical_spec(self, story_id: int) -> str:
        return _FAKE_TECH_SPEC

    def read_tech_stack(self) -> str:
        return _FAKE_TECH_STACK

    def read_context_file(self, filename: str) -> str:
        return ""

    def save_infra_delta(self, story_id: int, delta: dict) -> None:
        self.saved_delta = (story_id, delta)

    def load_infra_delta(self, story_id: int):
        return self.saved_delta[1] if self.saved_delta else None

    def save_deploy_pack(self, story_id: int, pack_md: str) -> None:
        self.saved_pack = (story_id, pack_md)

    def load_deploy_pack(self, story_id: int) -> str:
        return self.saved_pack[1] if self.saved_pack else ""

    def load_qa_results(self, story_id: int):
        return None

    def save_verification(self, story_id: int, data: dict) -> None:
        self.saved_verification = (story_id, data)

    def load_verification(self, story_id: int):
        return getattr(self, "saved_verification", (None, None))[1]

    def append_deployment_record(self, story_id, title, *, bypass, pack_present,
                                 sign_offs, notes=""):
        self.deployment_records.append({
            "story_id": story_id, "title": title, "bypass": bypass,
            "pack_present": pack_present, "sign_offs": sign_offs, "notes": notes,
        })


def _story_index(status: str = "qa_passed", **extra) -> dict:
    entry = {
        "story_id": 10,
        "epic_id": 1,
        "epic_title": "Authentication",
        "title": "User Login",
        "phase_status": status,
        "has_gherkin": True,
        "has_infra_delta": False,
        "has_deploy_pack": False,
        "deploy_bypass": False,
        "fix_bolt_count": 0,
        "has_bug_report": False,
    }
    entry.update(extra)
    return {"10": entry}


def _ctx() -> RequestContext:
    return RequestContext(pm_token="tok", project_id=1)


def _svc(ai=None, context=None) -> Phase5Service:
    return Phase5Service(ai=ai or FakeAiService(), context=context or FakeContextService())


# ---------------------------------------------------------------------------
# get_eligible_stories
# ---------------------------------------------------------------------------

def test_eligible_stories_only_qa_passed():
    index = {
        "1": {"story_id": 1, "title": "A", "phase_status": "qa", "epic_title": "X"},
        "2": {"story_id": 2, "title": "B", "phase_status": "qa_passed", "epic_title": "X"},
        "3": {"story_id": 3, "title": "C", "phase_status": "deployed", "epic_title": "X"},
    }
    stories = _svc(context=FakeContextService(index=index)).get_eligible_stories(_ctx())
    assert [s["story_id"] for s in stories] == [2]


def test_eligible_story_carries_phase5_flags():
    index = _story_index(has_infra_delta=True, deploy_bypass=True, fix_bolt_count=2)
    stories = _svc(context=FakeContextService(index=index)).get_eligible_stories(_ctx())
    assert stories[0]["has_infra_delta"] is True
    assert stories[0]["deploy_bypass"] is True
    assert stories[0]["fix_bolt_count"] == 2


# ---------------------------------------------------------------------------
# get_story_context
# ---------------------------------------------------------------------------

def test_story_context_returns_specs():
    data = _svc().get_story_context(_ctx(), 10)
    assert data["gherkin"] == _FAKE_GHERKIN
    assert data["technical_spec"] == _FAKE_TECH_SPEC
    assert data["github_context_synced"] is False


def test_story_context_rejects_wrong_status():
    ctx_service = FakeContextService(index=_story_index(status="qa"))
    with pytest.raises(Phase5ValidationError, match="not eligible"):
        _svc(context=ctx_service).get_story_context(_ctx(), 10)


def test_story_context_rejects_unknown_story():
    with pytest.raises(Phase5ValidationError, match="not found"):
        _svc().get_story_context(_ctx(), 999)


# ---------------------------------------------------------------------------
# infra delta
# ---------------------------------------------------------------------------

def test_generate_infra_delta_passes_context():
    ai = FakeAiService()
    svc = _svc(ai=ai)
    delta = svc.generate_infra_delta(_ctx(), 10)
    assert delta["needs_infra_change"] is False
    assert ai.infra_delta_args == ("User Login", _FAKE_GHERKIN, _FAKE_TECH_SPEC, _FAKE_TECH_STACK)


def test_generate_infra_delta_rejects_wrong_status():
    ctx_service = FakeContextService(index=_story_index(status="implementation"))
    with pytest.raises(Phase5ValidationError, match="not eligible"):
        _svc(context=ctx_service).generate_infra_delta(_ctx(), 10)


def test_save_infra_delta_rejects_flagged_but_empty():
    bad = {"needs_infra_change": True, "rationale": "x", "deltas": []}
    with pytest.raises(Phase5ValidationError, match="delta list is empty"):
        _svc().save_infra_delta(_ctx(), 10, bad)


def test_load_infra_delta_missing_raises():
    with pytest.raises(Phase5ValidationError, match="No infra delta"):
        _svc().load_infra_delta(_ctx(), 10)


# ---------------------------------------------------------------------------
# deploy pack
# ---------------------------------------------------------------------------

def test_generate_deploy_pack_requires_saved_delta():
    with pytest.raises(Phase5ValidationError, match="infra delta check"):
        _svc().generate_deploy_pack(_ctx(), 10)


def test_generate_deploy_pack_rejected_on_bypass():
    ctx_service = FakeContextService()
    svc = _svc(context=ctx_service)
    svc.save_infra_delta(_ctx(), 10, _FAKE_DELTA_BYPASS)
    with pytest.raises(Phase5ValidationError, match="routine deployment"):
        svc.generate_deploy_pack(_ctx(), 10)


def test_generate_deploy_pack_with_changes():
    ai = FakeAiService(delta=_FAKE_DELTA_CHANGES)
    ctx_service = FakeContextService()
    svc = _svc(ai=ai, context=ctx_service)
    svc.save_infra_delta(_ctx(), 10, _FAKE_DELTA_CHANGES)
    pack = svc.generate_deploy_pack(_ctx(), 10)
    assert pack == _FAKE_PACK
    assert "JWT signing secret" in ai.deploy_pack_args[1]  # rendered delta md


def test_revise_deploy_pack_passes_feedback():
    ai = FakeAiService(delta=_FAKE_DELTA_CHANGES)
    ctx_service = FakeContextService()
    svc = _svc(ai=ai, context=ctx_service)
    svc.save_infra_delta(_ctx(), 10, _FAKE_DELTA_CHANGES)
    revised = svc.revise_deploy_pack(_ctx(), 10, _FAKE_PACK, "Secret must be rotated quarterly.")
    assert revised.endswith("<!-- revised -->")
    assert ai.revise_args[1] == "Secret must be rotated quarterly."


# ---------------------------------------------------------------------------
# save_verification
# ---------------------------------------------------------------------------

def test_save_verification_allows_deployed_story():
    # Stage D auto-save fires on revisit after the gate has been passed.
    ctx_service = FakeContextService(index=_story_index(status="deployed"))
    svc = _svc(context=ctx_service)
    svc.save_verification(_ctx(), 10, {"scenarios": [], "summary": {}, "complete": False})
    assert ctx_service.saved_verification[0] == 10


def test_save_verification_rejects_pre_gate_status():
    ctx_service = FakeContextService(index=_story_index(status="qa"))
    with pytest.raises(Phase5ValidationError, match="not eligible"):
        _svc(context=ctx_service).save_verification(_ctx(), 10, {"scenarios": []})


# ---------------------------------------------------------------------------
# pass_deployment_gate (stubbed context)
# ---------------------------------------------------------------------------

def test_gate_requires_both_sign_offs():
    ctx_service = FakeContextService()
    svc = _svc(context=ctx_service)
    svc.save_infra_delta(_ctx(), 10, _FAKE_DELTA_BYPASS)
    with pytest.raises(Phase5ValidationError, match="Both sign-offs"):
        svc.pass_deployment_gate(_ctx(), 10, tech_lead_approved=True, devops_approved=False)


def test_gate_requires_saved_delta():
    with pytest.raises(Phase5ValidationError, match="infra delta check"):
        _svc().pass_deployment_gate(_ctx(), 10, tech_lead_approved=True, devops_approved=True)


def test_gate_requires_pack_when_changes_flagged():
    ctx_service = FakeContextService()
    svc = _svc(context=ctx_service)
    svc.save_infra_delta(_ctx(), 10, _FAKE_DELTA_CHANGES)
    with pytest.raises(Phase5ValidationError, match="deploy pack is required"):
        svc.pass_deployment_gate(_ctx(), 10, tech_lead_approved=True, devops_approved=True)


def test_gate_bypass_skips_pack_requirement(ctx):
    # Real context_manager via ctx fixture so the index transition is observable.
    ctx.init_context()
    ctx.upsert_story_index(10, title="User Login", phase_status="qa_passed")
    fake = FakeContextService()
    svc = _svc(context=fake)
    svc.save_infra_delta(_ctx(), 10, _FAKE_DELTA_BYPASS)
    svc.pass_deployment_gate(_ctx(), 10, tech_lead_approved=True, devops_approved=True)
    assert fake.deployment_records[0]["bypass"] is True
    assert ctx.get_story_index()["10"]["phase_status"] == "deployed"
    assert "deployed" in ctx.get_story_index()["10"]["status_history"]


# ---------------------------------------------------------------------------
# real context_manager persistence round-trips (ctx fixture)
# ---------------------------------------------------------------------------

def test_infra_delta_roundtrip_and_flags(ctx):
    ctx.init_context()
    ctx.upsert_story_index(10, title="User Login", phase_status="qa_passed")
    ctx.save_infra_delta(10, _FAKE_DELTA_CHANGES)
    assert ctx.load_infra_delta(10)["needs_infra_change"] is True
    entry = ctx.get_story_index()["10"]
    assert entry["has_infra_delta"] is True
    assert entry["deploy_bypass"] is False
    # Rendered markdown twin exists for human review
    assert (ctx.CONTEXT_DIR / "infra_delta_story_10.md").exists()


def test_deploy_pack_roundtrip(ctx):
    ctx.init_context()
    ctx.upsert_story_index(10, title="User Login", phase_status="qa_passed")
    ctx.save_deploy_pack(10, _FAKE_PACK)
    assert ctx.load_deploy_pack(10) == _FAKE_PACK
    assert ctx.get_story_index()["10"]["has_deploy_pack"] is True


def test_verification_roundtrip(ctx):
    ctx.init_context()
    matrix = {
        "scenarios": [
            {"scenario": "Successful login", "tasks": [1], "tasks_with_pack": [1],
             "qa_result": "pass", "gaps": []},
            {"scenario": "Invalid password", "tasks": [], "tasks_with_pack": [],
             "qa_result": "untested", "gaps": ["NO_COVERING_TASK", "NOT_TESTED"]},
        ],
        "summary": {"total": 2, "covered": 1, "with_pack": 1, "tested": 1, "gap_count": 2},
        "complete": False,
    }
    ctx.save_verification(10, matrix)
    loaded = ctx.load_verification(10)
    assert loaded["story_id"] == 10
    assert loaded["generated_at"]
    assert loaded["summary"]["gap_count"] == 2
    md = (ctx.CONTEXT_DIR / "verification_story_10.md").read_text(encoding="utf-8")
    assert "| Successful login | 1 | 1 | pass | — |" in md
    assert "NO_COVERING_TASK" in md


def test_gate_records_traceability_note():
    ctx_service = FakeContextService()
    svc = _svc(context=ctx_service)
    svc.save_infra_delta(_ctx(), 10, _FAKE_DELTA_BYPASS)
    svc.save_verification(_ctx(), 10, {
        "scenarios": [], "summary": {"total": 3, "covered": 2, "gap_count": 1}, "complete": False,
    })
    svc.pass_deployment_gate(_ctx(), 10, tech_lead_approved=True, devops_approved=True)
    assert "traceability: 2/3 scenarios covered, 1 gap(s)" in ctx_service.deployment_records[0]["notes"]


def test_gate_records_missing_matrix():
    ctx_service = FakeContextService()
    svc = _svc(context=ctx_service)
    svc.save_infra_delta(_ctx(), 10, _FAKE_DELTA_BYPASS)
    svc.pass_deployment_gate(_ctx(), 10, tech_lead_approved=True, devops_approved=True)
    assert "traceability matrix: not saved" in ctx_service.deployment_records[0]["notes"]


def test_deployment_log_appends(ctx):
    ctx.init_context()
    ctx.append_deployment_record(
        10, "User Login", bypass=True, pack_present=False,
        sign_offs=["Tech Lead", "DevOps Alliance"], notes="first deploy",
    )
    ctx.append_deployment_record(
        11, "Logout", bypass=False, pack_present=True,
        sign_offs=["Tech Lead", "DevOps Alliance"],
    )
    log = (ctx.CONTEXT_DIR / "deployment-log.md").read_text(encoding="utf-8")
    assert log.startswith("# Deployment Log")
    assert "## Deployment — Story 10 —" in log
    assert "## Deployment — Story 11 —" in log
    assert "first deploy" in log
