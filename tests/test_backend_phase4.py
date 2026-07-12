"""Tests for the Phase 4 backend service (QA assistant)."""

import pytest

from backend.app.services.phase4_service import Phase4Service, Phase4ValidationError
from backend.app.services.request_context import RequestContext


_FAKE_GHERKIN = "Feature: Login\n  Scenario: Successful login\n    Given a registered user\n    When they submit valid credentials\n    Then they receive a JWT token"

_FAKE_TECH_SPEC = "## Endpoints\n- `POST /auth/login` · auth:none · in:{email:str,password:str} · out:{token:str}"

_FAKE_TECH_STACK = "FastAPI + Next.js + PostgreSQL"

_FAKE_TEST_PLAN = (
    "## Scenario: Successful login\n\n"
    "### Test Steps\n1. Open the login page.\n\n"
    "### Expected Results\n- A JWT token is issued.\n"
)

_FAKE_BUG_REPORT = (
    "## Bug Summary\nLogin returns 500.\n\n"
    "## Failed Scenario\nSuccessful login\n\n"
    "## Fix-Bolt Brief\nPatch the login endpoint.\n"
)


class FakeAiService:
    def __init__(self):
        self.test_plan_args = None
        self.bug_report_args = None
        self.bug_report_kwargs: dict = {}

    def generate_test_plan(self, story_subject, gherkin, technical_spec, tech_stack="",
                           developer_packs=None, constraints="", instructions="", emphasis=None,
                           figma_context="", github_context=""):
        self.test_plan_args = (story_subject, gherkin, technical_spec, tech_stack)
        self.test_plan_developer_packs = developer_packs
        self.test_plan_constraints = constraints
        self.test_plan_instructions = instructions
        self.test_plan_emphasis = emphasis
        self.test_plan_figma_context = figma_context
        self.test_plan_github_context = github_context
        return _FAKE_TEST_PLAN

    def generate_bug_report(self, story_subject, gherkin, technical_spec, failed_scenario, qa_notes):
        self.bug_report_args = (story_subject, gherkin, technical_spec)
        self.bug_report_kwargs = {"failed_scenario": failed_scenario, "qa_notes": qa_notes}
        return _FAKE_BUG_REPORT

    def generate_edge_cases(self, scenario_text, technical_spec=""):
        self.edge_cases_args = (scenario_text, technical_spec)
        return "- empty password → 400\n- expired token → 401"


class FakeContextService:
    def __init__(self, index=None):
        self.project_id = 0
        self.index = index if index is not None else _story_index()

    def set_active(self, ctx):
        self.set_project(ctx.project_id)

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
        return getattr(self, "context_files", {}).get(filename, "")

    def load_bdd_tests(self, story_id: int) -> str:
        return _FAKE_TEST_PLAN

    def load_proposals(self, story_id: int) -> list[dict]:
        return getattr(self, "proposals", [])

    # Writes delegate to the real context_manager (the `ctx` fixture points it
    # at tmp_path) so the write-path tests can assert through `ctx`.
    def save_bdd_tests(self, story_id: int, test_script: str) -> None:
        from src import context_manager
        context_manager.save_bdd_tests(story_id, test_script)

    def delete_bdd_tests(self, story_id: int) -> None:
        from src import context_manager
        context_manager.delete_bdd_tests(story_id)

    def save_qa_results(self, story_id: int, gate: str, results: list[dict]) -> None:
        from src import context_manager
        context_manager.save_qa_results(story_id, gate, results)

    def save_bug_report(self, story_id: int, bug_md: str) -> None:
        from src import context_manager
        context_manager.save_bug_report(story_id, bug_md)

    def increment_story_counter(self, story_id: int, field: str = "fix_bolt_count") -> int:
        from src import context_manager
        return context_manager.increment_story_counter(story_id, field)

    def append_fix_log_record(self, issue_id: int, root_cause: str, resolution_summary: str) -> None:
        from src import context_manager
        context_manager.append_fix_log_record(issue_id, root_cause, resolution_summary)

    def upsert_story_index(self, story_id: int, **updates) -> None:
        from src import context_manager
        context_manager.upsert_story_index(story_id, **updates)


def _story_index(status: str = "implementation", **extra) -> dict:
    entry = {
        "story_id": 10,
        "epic_id": 1,
        "epic_title": "Authentication",
        "title": "User Login",
        "phase_status": status,
        "has_gherkin": True,
        "has_bdd": False,
        "has_bug_report": False,
    }
    entry.update(extra)
    return {"10": entry}


def _ctx() -> RequestContext:
    return RequestContext(pm_token="tok", project_id=1)


# ---------------------------------------------------------------------------
# get_eligible_stories
# ---------------------------------------------------------------------------

def test_eligible_stories_includes_implementation_and_qa():
    index = {
        "1": {"story_id": 1, "title": "A", "phase_status": "implementation", "epic_title": "X"},
        "2": {"story_id": 2, "title": "B", "phase_status": "qa", "epic_title": "X"},
        "3": {"story_id": 3, "title": "C", "phase_status": "design_locked", "epic_title": "X"},
        "4": {"story_id": 4, "title": "D", "phase_status": "qa_passed", "epic_title": "X"},
    }
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService(index=index))
    stories = svc.get_eligible_stories(_ctx())
    assert [s["story_id"] for s in stories] == [1, 2]


def test_eligible_stories_flags_regression_bypass():
    index = _story_index(status="implementation", has_bug_report=True)
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService(index=index))
    stories = svc.get_eligible_stories(_ctx())
    assert stories[0]["is_regression_bypass"] is True


def test_eligible_stories_no_bypass_when_in_qa():
    index = _story_index(status="qa", has_bug_report=True)
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService(index=index))
    stories = svc.get_eligible_stories(_ctx())
    assert stories[0]["is_regression_bypass"] is False


# ---------------------------------------------------------------------------
# list_all_test_plans
# ---------------------------------------------------------------------------

def test_list_all_test_plans_only_includes_stories_with_bdd():
    index = {
        "10": {"story_id": 10, "title": "User Login", "has_bdd": True},
        "11": {"story_id": 11, "title": "Logout", "has_bdd": False},
        "12": {"story_id": 12, "title": "Reset", "has_bdd": True},
    }
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService(index=index))
    plans = svc.list_all_test_plans(_ctx())
    assert [p["story_id"] for p in plans] == [10, 12]
    assert plans[0]["title"] == "User Login"
    assert plans[0]["chars"] == len(_FAKE_TEST_PLAN)


# ---------------------------------------------------------------------------
# get_story_context
# ---------------------------------------------------------------------------

def test_get_story_context_returns_all_fields():
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    data = svc.get_story_context(_ctx(), 10)
    assert data["story_id"] == 10
    assert data["gherkin"] == _FAKE_GHERKIN
    assert data["technical_spec"] == _FAKE_TECH_SPEC
    assert data["tech_stack"] == _FAKE_TECH_STACK


def test_get_story_context_has_no_task_list():
    """Regression: task lists were removed with the dual-source task system
    (commit 6147855); the service must not reference the deleted accessors."""
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    data = svc.get_story_context(_ctx(), 10)
    assert "task_list" not in data


def test_get_story_context_raises_for_unknown_story():
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    with pytest.raises(Phase4ValidationError, match="not found"):
        svc.get_story_context(_ctx(), 999)


def test_get_story_context_rejects_ineligible_status():
    index = _story_index(status="design_locked")
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService(index=index))
    with pytest.raises(Phase4ValidationError, match="not eligible"):
        svc.get_story_context(_ctx(), 10)


def test_get_story_context_works_with_real_context_service(ctx):
    """End-to-end through the real ContextService + context_manager — guards
    against ContextService methods that delegate to deleted functions."""
    from backend.app.services.context_service import ContextService

    ctx.set_active_project(1)
    ctx.append_gherkin(10, "User Login", _FAKE_GHERKIN, epic_id=1, epic_title="Authentication")
    ctx.upsert_story_index(10, phase_status="qa")
    svc = Phase4Service(ai=FakeAiService(), context=ContextService())
    data = svc.get_story_context(_ctx(), 10)
    assert data["story_id"] == 10
    assert "Successful login" in data["gherkin"]


# ---------------------------------------------------------------------------
# Fix-Bolt artifacts (bug reports + fix log)
# ---------------------------------------------------------------------------

def test_fix_bolt_list_delete_keeps_flag_and_fix_log(ctx):
    """list_all_bug_reports + delete (file-only, flag kept) + get_fix_log,
    end-to-end through the real ContextService + context_manager."""
    from backend.app.services.context_service import ContextService
    from src import context_manager

    ctx.set_active_project(1)
    ctx.append_gherkin(10, "User Login", _FAKE_GHERKIN, epic_id=1, epic_title="Authentication")
    ctx.append_gherkin(11, "User Logout", _FAKE_GHERKIN, epic_id=1, epic_title="Authentication")
    context_manager.save_bug_report(10, "# Bug US#10\nboom")
    context_manager.save_bug_report(11, "# Bug US#11\nboom")

    svc = Phase4Service(ai=FakeAiService(), context=ContextService())

    reports = svc.list_all_bug_reports(_ctx())
    assert {r["story_id"] for r in reports} == {10, 11}
    assert any(r["title"] == "User Login" for r in reports)
    assert all(r["chars"] > 0 for r in reports)

    # delete removes the file but KEEPS has_bug_report (regression-bypass safe)
    svc.delete_bug_report(_ctx(), 10)
    reports = svc.list_all_bug_reports(_ctx())
    assert {r["story_id"] for r in reports} == {11}  # 10's file gone → excluded
    assert context_manager.get_story_index()["10"]["has_bug_report"] is True

    # fix log read-through
    context_manager.append_fix_log_record(11, "null deref in handler", "added guard")
    assert "null deref in handler" in svc.get_fix_log(_ctx())


def test_save_bug_report_rejects_unknown_story(ctx):
    from backend.app.services.context_service import ContextService

    ctx.set_active_project(1)
    svc = Phase4Service(ai=FakeAiService(), context=ContextService())
    with pytest.raises(Phase4ValidationError):
        svc.save_bug_report(_ctx(), 999, "# orphan")


# ---------------------------------------------------------------------------
# generate_test_plan
# ---------------------------------------------------------------------------

def test_generate_test_plan_passes_developer_packs():
    ctx_svc = FakeContextService()
    ctx_svc.proposals = [{"task_id": 7, "proposal_md": "## Context\nBuilt with FastAPI."}]
    ai = FakeAiService()
    svc = Phase4Service(ai=ai, context=ctx_svc)
    svc.generate_test_plan(_ctx(), 10)
    packs = ai.test_plan_developer_packs
    assert packs and packs[0]["proposal_md"] == "## Context\nBuilt with FastAPI."


def test_generate_test_plan_threads_optional_instructions():
    ai = FakeAiService()
    svc = Phase4Service(ai=ai, context=FakeContextService())
    svc.generate_test_plan(_ctx(), 10, "favour the staging env; probe rate limits")
    assert ai.test_plan_instructions == "favour the staging env; probe rate limits"


def test_generate_test_plan_instructions_default_empty():
    ai = FakeAiService()
    svc = Phase4Service(ai=ai, context=FakeContextService())
    svc.generate_test_plan(_ctx(), 10)
    assert ai.test_plan_instructions == ""
    assert ai.test_plan_emphasis == []


def test_generate_test_plan_threads_emphasis():
    ai = FakeAiService()
    svc = Phase4Service(ai=ai, context=FakeContextService())
    svc.generate_test_plan(_ctx(), 10, emphasis=["security", "edge_cases"])
    assert ai.test_plan_emphasis == ["security", "edge_cases"]


def test_test_plan_preferences_block_renders_known_emphasis_only():
    from src.ai_engine import _test_plan_preferences_block
    block = _test_plan_preferences_block(["security", "bogus"], "favour staging")
    assert "Security:" in block
    assert "bogus" not in block
    assert "favour staging" in block
    assert _test_plan_preferences_block([], "") == ""


def test_generate_test_plan_returns_markdown():
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    md = svc.generate_test_plan(_ctx(), 10)
    assert "## Scenario:" in md


def test_generate_test_plan_passes_context_to_ai():
    ai = FakeAiService()
    svc = Phase4Service(ai=ai, context=FakeContextService())
    svc.generate_test_plan(_ctx(), 10)
    story_subject, gherkin, technical_spec, tech_stack = ai.test_plan_args
    assert story_subject == "User Login"
    assert gherkin == _FAKE_GHERKIN
    assert tech_stack == _FAKE_TECH_STACK


def test_generate_test_plan_injects_figma_context():
    # #3: the synced Figma design markdown grounds the QA test plan.
    ai = FakeAiService()
    ctx_svc = FakeContextService()
    ctx_svc.context_files = {"figma-context.md": "## Screens\n- Login\n## Prototype flows\n- Login → Home"}
    svc = Phase4Service(ai=ai, context=ctx_svc)
    svc.generate_test_plan(_ctx(), 10)
    assert "Login → Home" in ai.test_plan_figma_context


def test_generate_test_plan_figma_context_empty_by_default():
    ai = FakeAiService()
    svc = Phase4Service(ai=ai, context=FakeContextService())
    svc.generate_test_plan(_ctx(), 10)
    assert ai.test_plan_figma_context == ""


def test_generate_test_plan_injects_github_context():
    # The synced repo pack (real file tree, endpoints, configs) grounds the QA test plan.
    ai = FakeAiService()
    ctx_svc = FakeContextService()
    ctx_svc.context_files = {"github-context.md": "## File Tree\n- backend/app/api/auth.py"}
    svc = Phase4Service(ai=ai, context=ctx_svc)
    svc.generate_test_plan(_ctx(), 10)
    assert "auth.py" in ai.test_plan_github_context


def test_generate_test_plan_github_context_empty_by_default():
    ai = FakeAiService()
    svc = Phase4Service(ai=ai, context=FakeContextService())
    svc.generate_test_plan(_ctx(), 10)
    assert ai.test_plan_github_context == ""


def test_generate_test_plan_rejects_ineligible_status():
    index = _story_index(status="design_locked")
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService(index=index))
    with pytest.raises(Phase4ValidationError, match="not eligible"):
        svc.generate_test_plan(_ctx(), 10)


def test_generate_test_plan_rejects_empty_gherkin():
    class EmptyGherkinContext(FakeContextService):
        def story_gherkin(self, story_id):
            return "  "

    svc = Phase4Service(ai=FakeAiService(), context=EmptyGherkinContext())
    with pytest.raises(Phase4ValidationError, match="no Gherkin"):
        svc.generate_test_plan(_ctx(), 10)


# ---------------------------------------------------------------------------
# save / load test plan (real context_manager via ctx fixture)
# ---------------------------------------------------------------------------

def test_save_test_plan_persists_and_marks_qa(ctx):
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    svc.save_test_plan(_ctx(), 10, _FAKE_TEST_PLAN)
    assert ctx.load_bdd_tests(10) == _FAKE_TEST_PLAN
    entry = ctx.get_story_index()["10"]
    assert entry["has_bdd"] is True
    assert entry["phase_status"] == "qa"


def test_load_test_plan_returns_saved_content():
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    assert svc.load_test_plan(_ctx(), 10) == _FAKE_TEST_PLAN


# ---------------------------------------------------------------------------
# generate_bug_report
# ---------------------------------------------------------------------------

def test_generate_bug_report_combines_failed_scenarios():
    ai = FakeAiService()
    svc = Phase4Service(ai=ai, context=FakeContextService())
    md = svc.generate_bug_report(_ctx(), 10, [
        {"scenario_name": "Successful login", "qa_notes": "Got a 500."},
        {"scenario_name": "Wrong password", "qa_notes": ""},
    ])
    assert md == _FAKE_BUG_REPORT
    assert ai.bug_report_kwargs["failed_scenario"] == "Successful login"
    notes = ai.bug_report_kwargs["qa_notes"]
    assert "Got a 500." in notes
    assert "Wrong password" in notes
    assert "No notes provided." in notes


def test_generate_bug_report_raises_for_unknown_story():
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    with pytest.raises(Phase4ValidationError, match="not found"):
        svc.generate_bug_report(_ctx(), 999, [{"scenario_name": "X", "qa_notes": ""}])


# ---------------------------------------------------------------------------
# pass_gate / fail_gate (real context_manager via ctx fixture)
# ---------------------------------------------------------------------------

def test_pass_gate_transitions_to_qa_passed(ctx):
    ctx.init_context()  # a story only reaches Phase 4 after earlier phases created the dir
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    svc.pass_gate(_ctx(), 10)
    assert ctx.get_story_index()["10"]["phase_status"] == "qa_passed"


def test_fail_gate_saves_bug_report_and_fix_log(ctx):
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    svc.fail_gate(_ctx(), 10, _FAKE_BUG_REPORT, "Missing null check", "Added validation")
    assert ctx.load_bug_report(10) == _FAKE_BUG_REPORT
    assert ctx.get_story_index()["10"]["has_bug_report"] is True
    assert "Missing null check" in ctx.get_fix_log()


def test_fail_gate_skips_fix_log_when_no_root_cause(ctx):
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    svc.fail_gate(_ctx(), 10, _FAKE_BUG_REPORT, "", "")
    assert ctx.load_bug_report(10) == _FAKE_BUG_REPORT
    assert "## Fix #" not in ctx.get_fix_log()


def test_delete_test_plan_rolls_back_to_implementation(ctx):
    ctx.init_context()
    ctx.save_bdd_tests(10, _FAKE_TEST_PLAN)  # sets has_bdd=True, phase_status="qa"
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    svc.delete_test_plan(_ctx(), 10)
    entry = ctx.get_story_index()["10"]
    assert entry["has_bdd"] is False
    assert entry["phase_status"] == "implementation"
    assert ctx.load_bdd_tests(10) == ""


def test_delete_test_plan_keeps_qa_passed_status(ctx):
    # Clearing a plan must not demote a story that already passed the gate.
    ctx.init_context()
    ctx.save_bdd_tests(10, _FAKE_TEST_PLAN)
    ctx.upsert_story_index(10, phase_status="qa_passed")
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    svc.delete_test_plan(_ctx(), 10)
    assert ctx.get_story_index()["10"]["phase_status"] == "qa_passed"


def test_fail_gate_increments_fix_bolt_count(ctx):
    ctx.init_context()
    ctx.upsert_story_index(10, title="S", phase_status="qa")
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    svc.fail_gate(_ctx(), 10, _FAKE_BUG_REPORT, "", "")
    svc.fail_gate(_ctx(), 10, _FAKE_BUG_REPORT, "", "")
    assert ctx.get_story_index()["10"]["fix_bolt_count"] == 2


def test_pass_gate_persists_scenario_results(ctx):
    ctx.init_context()
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    svc.pass_gate(_ctx(), 10, scenario_results=[
        {"scenario": "Successful login", "result": "pass", "notes": ""},
    ])
    data = ctx.load_qa_results(10)
    assert data["attempts"][0]["gate"] == "pass"
    assert data["attempts"][0]["results"][0]["scenario"] == "Successful login"


def test_qa_results_accumulate_fail_then_pass(ctx):
    ctx.init_context()
    svc = Phase4Service(ai=FakeAiService(), context=FakeContextService())
    svc.fail_gate(_ctx(), 10, _FAKE_BUG_REPORT, "", "", scenario_results=[
        {"scenario": "Successful login", "result": "fail", "notes": "500 on submit"},
    ])
    svc.pass_gate(_ctx(), 10, scenario_results=[
        {"scenario": "Successful login", "result": "pass", "notes": ""},
    ])
    data = ctx.load_qa_results(10)
    assert [a["gate"] for a in data["attempts"]] == ["fail", "pass"]


# --- on-demand edge cases (Phase 4 post-MVP) ------------------------------

class TestGenerateEdgeCases:
    def _service(self, index):
        ctx_svc = FakeContextService(index=index)
        ai = FakeAiService()
        return Phase4Service(ai=ai, context=ctx_svc), ai

    def test_generates_edge_cases_with_tech_spec(self):
        index = {"7": {"story_id": 7, "title": "Login", "phase_status": "qa"}}
        svc, ai = self._service(index)
        out = svc.generate_edge_cases(_ctx(), 7, "Scenario: User signs in")
        assert "expired token" in out
        # the story's technical spec is passed for risk grounding
        assert ai.edge_cases_args[0] == "Scenario: User signs in"
        assert ai.edge_cases_args[1] == _FAKE_TECH_SPEC

    def test_blank_scenario_raises(self):
        svc, _ = self._service({"7": {"story_id": 7, "phase_status": "qa"}})
        with pytest.raises(Phase4ValidationError):
            svc.generate_edge_cases(_ctx(), 7, "   ")

    def test_unknown_story_raises(self):
        svc, _ = self._service({})
        with pytest.raises(Phase4ValidationError):
            svc.generate_edge_cases(_ctx(), 99, "Scenario: x")
