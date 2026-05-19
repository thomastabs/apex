"""Unit tests for the FastAPI Phase 2 service and API routes.

Replaces the old Reflex-era test_phase2.py which imported the deleted
state.phase2 module. Coverage targets:
  - Phase2Service: all public methods, edge cases, and validation guards
  - Phase2 API routes: error mapping (validation → 409, Taiga/AI → 502)
  - _extract_tech_stack: all memory-bank formats
"""

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
from backend.app.services.phase2_service import Phase2Service, Phase2ValidationError
from backend.app.services.request_context import RequestContext
from src.ai_engine import AIError, AIRateLimitError
from src.taiga_adapter import TaigaAPIError


# ---------------------------------------------------------------------------
# Shared fakes
# ---------------------------------------------------------------------------

class FakeAiService:
    def __init__(self, *, design_result=None, stack_result=None):
        self.tech_stack_args = None
        self.design_args = None
        self._design_result = design_result or {
            "wireframes": "SCREEN",
            "user_flow": "flowchart TD\nA-->B",
            "component_tree": "App\n  Page",
            "tech_spec": "openapi: 3.0.0",
        }
        self._stack_result = stack_result or [
            {"name": "FastAPI + Next.js", "description": "Good fit.", "trade_offs": "+ simple"}
        ]

    def suggest_tech_stack(self, all_stories, context, hint):
        self.tech_stack_args = (all_stories, context, hint)
        return self._stack_result

    def generate_phase2_design(self, epic_title, stories, context, cross_epic_context):
        self.design_args = (epic_title, stories, context, cross_epic_context)
        return self._design_result


class FakeContextService:
    def __init__(self, *, memory_bank=None, index=None):
        self.project_id = 0
        self.memory_bank = memory_bank if memory_bank is not None else _memory_bank_with_stack()
        self.index = index if index is not None else _story_index()
        self.written_stack = None
        self.appended_tech = None
        self.appended_bundle = None
        self.appended_design = None

    def set_project(self, project_id):
        self.project_id = project_id

    def read_memory_bank(self):
        return self.memory_bank

    def write_tech_stack(self, tech_stack):
        self.written_stack = tech_stack

    def story_index(self):
        return self.index

    def story_gherkin(self, story_id):
        return f"Feature: Story {story_id}\n\n  Scenario: Happy path\n    Given state\n    When act\n    Then result"

    def other_epics_design_context(self, exclude_epic_id):
        return f"cross-epic context excluding {exclude_epic_id}"

    def append_epic_technical_spec(self, epic_id, epic_title, story_ids, spec):
        self.appended_tech = (epic_id, epic_title, story_ids, spec)

    def append_epic_design_bundle(self, epic_id, epic_title, wireframes, user_flow, component_tree, tech_spec):
        self.appended_bundle = (epic_id, epic_title, wireframes, user_flow, component_tree, tech_spec)

    def append_memory_bank_design(self, epic_id, epic_title, *, prototype_summary, tech_spec_summary):
        self.appended_design = (epic_id, epic_title, prototype_summary, tech_spec_summary)


class FakeTaigaService:
    def __init__(self, *, fail_story_id=None, epics=None):
        self.token = ""
        self.project_id = 0
        self.fail_story_id = fail_story_id
        self.updated_stories: list = []
        self._epics = epics or [
            {"id": 7, "subject": "Authentication"},
            {"id": 9, "subject": "Billing"},
        ]

    def set_context(self, token, project_id):
        self.token = token
        self.project_id = project_id

    def get_epics(self):
        return self._epics

    def get_epic(self, epic_id):
        for e in self._epics:
            if e["id"] == epic_id:
                return e
        return {"id": epic_id, "subject": f"Epic {epic_id}"}

    def find_design_locked_status_id(self):
        return 12

    def get_story(self, story_id):
        if story_id == self.fail_story_id:
            raise RuntimeError("Taiga unavailable")
        return {"id": story_id, "version": 2, "tags": ["gherkin"]}

    def update_story_fields(self, story_id, version, *, tags=None, status_id=None):
        self.updated_stories.append((story_id, version, tags, status_id))
        return {"id": story_id, "version": version + 1}


# ---------------------------------------------------------------------------
# Test data helpers
# ---------------------------------------------------------------------------

def _memory_bank_with_stack():
    return """\
# Memory Bank

## Project Concept

Test project.

## Tech Stack

FastAPI + Next.js + PostgreSQL

## Architecture Principles

Keep it simple.
"""


def _memory_bank_without_stack():
    return """\
# Memory Bank

## Tech Stack

<!-- Fill in stack -->

## Architecture Principles

Keep it simple.
"""


def _memory_bank_empty_tech_section():
    return """\
# Memory Bank

## Tech Stack

## Architecture Principles

Keep it simple.
"""


def _memory_bank_no_tech_section():
    return """\
# Memory Bank

## Project Concept

No tech section at all.
"""


def _story_index():
    return {
        "10": {
            "story_id": 10,
            "epic_id": 7,
            "title": "Login",
            "phase_status": "gherkin_locked",
            "has_gherkin": True,
        },
        "11": {
            "story_id": 11,
            "epic_id": 7,
            "title": "Logout",
            "phase_status": "design_locked",
            "has_gherkin": True,
        },
        "20": {
            "story_id": 20,
            "epic_id": 9,
            "title": "Pay",
            "phase_status": "gherkin_locked",
            "has_gherkin": True,
        },
        "99": {
            "story_id": 99,
            "epic_id": 9,
            "title": "Pending Billing",
            "phase_status": "pending",
            "has_gherkin": False,
        },
    }


def _ctx():
    return RequestContext(taiga_token="tok", project_id=42)


def _service(*, context=None, taiga=None, ai=None):
    ai_svc = ai or FakeAiService()
    ctx_svc = context or FakeContextService()
    taiga_svc = taiga or FakeTaigaService()
    svc = Phase2Service(ai=ai_svc, context=ctx_svc, taiga=taiga_svc)
    return svc, ai_svc, ctx_svc, taiga_svc


# ---------------------------------------------------------------------------
# tech_stack_status
# ---------------------------------------------------------------------------

class TestTechStackStatus:
    def test_detects_locked_stack(self):
        svc, _, _, _ = _service()
        result = svc.tech_stack_status(_ctx())
        assert result == {"defined": True, "tech_stack": "FastAPI + Next.js + PostgreSQL"}

    def test_wires_project_and_token(self):
        svc, _, ctx_svc, taiga_svc = _service()
        svc.tech_stack_status(_ctx())
        assert ctx_svc.project_id == 42
        assert taiga_svc.token == "tok"

    def test_placeholder_comment_returns_undefined(self):
        svc, _, _, _ = _service(context=FakeContextService(memory_bank=_memory_bank_without_stack()))
        assert svc.tech_stack_status(_ctx()) == {"defined": False, "tech_stack": None}

    def test_empty_tech_section_returns_undefined(self):
        svc, _, _, _ = _service(context=FakeContextService(memory_bank=_memory_bank_empty_tech_section()))
        assert svc.tech_stack_status(_ctx()) == {"defined": False, "tech_stack": None}

    def test_missing_tech_section_returns_undefined(self):
        svc, _, _, _ = _service(context=FakeContextService(memory_bank=_memory_bank_no_tech_section()))
        assert svc.tech_stack_status(_ctx()) == {"defined": False, "tech_stack": None}


# ---------------------------------------------------------------------------
# eligible_epics
# ---------------------------------------------------------------------------

class TestEligibleEpics:
    def test_includes_gherkin_locked_epic(self):
        svc, _, _, _ = _service()
        epics = svc.eligible_epics(_ctx())
        epic_ids = [e["epic_id"] for e in epics]
        assert 7 in epic_ids
        assert 9 in epic_ids

    def test_excludes_stories_without_gherkin(self):
        # story 99 has has_gherkin=False — should not contribute to count
        svc, _, _, _ = _service()
        epics = svc.eligible_epics(_ctx())
        epic_9 = next(e for e in epics if e["epic_id"] == 9)
        assert epic_9["story_count"] == 1  # only story 20

    def test_status_gherkin_locked_when_mixed(self):
        # epic 7: story 10 is gherkin_locked, story 11 is design_locked → overall gherkin_locked
        svc, _, _, _ = _service()
        epics = svc.eligible_epics(_ctx())
        epic_7 = next(e for e in epics if e["epic_id"] == 7)
        assert epic_7["phase_status"] == "gherkin_locked"

    def test_status_design_locked_when_all_locked(self):
        index = {
            "10": {"story_id": 10, "epic_id": 7, "title": "A", "phase_status": "design_locked", "has_gherkin": True},
            "11": {"story_id": 11, "epic_id": 7, "title": "B", "phase_status": "design_locked", "has_gherkin": True},
        }
        svc, _, _, _ = _service(context=FakeContextService(index=index))
        epics = svc.eligible_epics(_ctx())
        assert epics[0]["phase_status"] == "design_locked"

    def test_uses_taiga_subject_as_epic_title(self):
        svc, _, _, _ = _service()
        epics = svc.eligible_epics(_ctx())
        epic_7 = next(e for e in epics if e["epic_id"] == 7)
        assert epic_7["epic_title"] == "Authentication"

    def test_falls_back_to_epic_id_when_not_in_taiga(self):
        index = {
            "30": {"story_id": 30, "epic_id": 999, "title": "X", "phase_status": "gherkin_locked", "has_gherkin": True},
        }
        svc, _, _, _ = _service(context=FakeContextService(index=index))
        epics = svc.eligible_epics(_ctx())
        assert epics[0]["epic_title"] == "Epic 999"

    def test_excludes_stories_without_epic_id(self):
        index = {
            "10": {"story_id": 10, "epic_id": None, "title": "A", "phase_status": "gherkin_locked", "has_gherkin": True},
        }
        svc, _, _, _ = _service(context=FakeContextService(index=index))
        assert svc.eligible_epics(_ctx()) == []

    def test_empty_index_returns_empty_list(self):
        svc, _, _, _ = _service(context=FakeContextService(index={}))
        assert svc.eligible_epics(_ctx()) == []


# ---------------------------------------------------------------------------
# propose_tech_stack
# ---------------------------------------------------------------------------

class TestProposeTechStack:
    def test_raises_when_no_locked_stories(self):
        empty = {"1": {"story_id": 1, "epic_id": 7, "phase_status": "pending", "has_gherkin": False}}
        svc, _, _, _ = _service(context=FakeContextService(index=empty))
        with pytest.raises(Phase2ValidationError, match="No Phase 1 locked"):
            svc.propose_tech_stack(_ctx())

    def test_passes_all_locked_stories_to_ai(self):
        svc, ai, _, _ = _service()
        svc.propose_tech_stack(_ctx(), hint="Prefer Python")
        stories, memory_bank, hint = ai.tech_stack_args
        # stories 10, 11, 20 qualify (gherkin_locked or design_locked + has_gherkin)
        assert len(stories) == 3
        assert hint == "Prefer Python"

    def test_memory_bank_passed_to_ai(self):
        svc, ai, _, _ = _service()
        svc.propose_tech_stack(_ctx())
        _, memory_bank, _ = ai.tech_stack_args
        assert "FastAPI + Next.js + PostgreSQL" in memory_bank

    def test_excludes_pending_stories(self):
        svc, ai, _, _ = _service()
        svc.propose_tech_stack(_ctx())
        stories, _, _ = ai.tech_stack_args
        titles = [s["title"] for s in stories]
        assert "Pending Billing" not in titles


# ---------------------------------------------------------------------------
# lock_tech_stack
# ---------------------------------------------------------------------------

class TestLockTechStack:
    def test_writes_and_returns_stack(self):
        svc, _, ctx_svc, _ = _service()
        result = svc.lock_tech_stack(_ctx(), tech_stack=" Django + React ")
        assert result == {"defined": True, "tech_stack": "Django + React"}
        assert ctx_svc.written_stack == "Django + React"

    def test_empty_tech_stack_raises(self):
        svc, _, _, _ = _service()
        with pytest.raises(Phase2ValidationError, match="tech_stack is required"):
            svc.lock_tech_stack(_ctx(), tech_stack="   ")


# ---------------------------------------------------------------------------
# generate_design_bundle
# ---------------------------------------------------------------------------

class TestGenerateDesignBundle:
    def test_raises_when_no_tech_stack(self):
        svc, _, _, _ = _service(context=FakeContextService(memory_bank=_memory_bank_without_stack()))
        with pytest.raises(Phase2ValidationError, match="Tech Stack"):
            svc.generate_design_bundle(_ctx(), epic_id=7)

    def test_raises_when_epic_id_zero(self):
        svc, _, _, _ = _service()
        with pytest.raises(Phase2ValidationError, match="epic_id"):
            svc.generate_design_bundle(_ctx(), epic_id=0)

    def test_raises_when_epic_id_negative(self):
        svc, _, _, _ = _service()
        with pytest.raises(Phase2ValidationError, match="epic_id"):
            svc.generate_design_bundle(_ctx(), epic_id=-1)

    def test_raises_when_no_stories_for_epic(self):
        svc, _, _, _ = _service()
        with pytest.raises(Phase2ValidationError, match="No Phase 1 locked Gherkin"):
            svc.generate_design_bundle(_ctx(), epic_id=999)

    def test_returns_bundle_with_story_ids(self):
        svc, _, _, _ = _service()
        result = svc.generate_design_bundle(_ctx(), epic_id=7)
        assert result["wireframes"] == "SCREEN"
        assert result["story_ids"] == [10, 11]

    def test_injects_binding_tech_stack_constraint(self):
        svc, ai, _, _ = _service()
        svc.generate_design_bundle(_ctx(), epic_id=7)
        _, _, context, _ = ai.design_args
        assert "locked and binding" in context
        assert "FastAPI + Next.js + PostgreSQL" in context

    def test_passes_epic_title_from_taiga(self):
        svc, ai, _, _ = _service()
        svc.generate_design_bundle(_ctx(), epic_id=7)
        epic_title, _, _, _ = ai.design_args
        assert epic_title == "Authentication"

    def test_passes_cross_epic_context(self):
        svc, ai, _, _ = _service()
        svc.generate_design_bundle(_ctx(), epic_id=7)
        _, _, _, cross_epic = ai.design_args
        assert "excluding 7" in cross_epic

    def test_stories_sorted_by_id(self):
        svc, ai, _, _ = _service()
        svc.generate_design_bundle(_ctx(), epic_id=7)
        _, stories, _, _ = ai.design_args
        ids = [s["story_id"] for s in stories]
        assert ids == sorted(ids)


# ---------------------------------------------------------------------------
# lock_epic_design
# ---------------------------------------------------------------------------

class TestLockEpicDesign:
    def _lock(self, svc, **overrides):
        defaults = dict(
            epic_id=7,
            epic_title="Authentication",
            story_ids=[10, 11],
            wireframes="SCREEN",
            user_flow="flowchart TD",
            component_tree="App",
            tech_spec="openapi: 3.0.0",
        )
        return svc.lock_epic_design(_ctx(), **{**defaults, **overrides})

    def test_success_persists_all_artifacts(self):
        svc, _, ctx_svc, _ = _service()
        result = self._lock(svc)
        assert result["ok"] is True
        assert result["taiga_failures"] == []
        assert ctx_svc.appended_tech == (7, "Authentication", [10, 11], "openapi: 3.0.0")
        assert ctx_svc.appended_design[:2] == (7, "Authentication")
        assert ctx_svc.appended_bundle[:2] == (7, "Authentication")

    def test_transitions_taiga_stories(self):
        svc, _, _, taiga_svc = _service()
        self._lock(svc)
        updated_ids = [row[0] for row in taiga_svc.updated_stories]
        assert 10 in updated_ids
        assert 11 in updated_ids

    def test_transition_adds_design_locked_tag(self):
        svc, _, _, taiga_svc = _service()
        self._lock(svc)
        tags_10 = taiga_svc.updated_stories[0][2]
        assert "design_locked" in tags_10
        assert "apex" in tags_10

    def test_taiga_failure_recorded_without_aborting(self):
        svc, _, ctx_svc, _ = _service(taiga=FakeTaigaService(fail_story_id=11))
        result = self._lock(svc)
        assert result["ok"] is False
        assert result["taiga_failures"] == [{"story_id": 11, "error": "Taiga unavailable"}]
        # artifacts still persisted despite Taiga failure
        assert ctx_svc.appended_tech is not None

    def test_raises_when_epic_id_zero(self):
        svc, _, _, _ = _service()
        with pytest.raises(Phase2ValidationError, match="epic_id"):
            self._lock(svc, epic_id=0)

    def test_raises_when_tech_spec_empty(self):
        svc, _, _, _ = _service()
        with pytest.raises(Phase2ValidationError, match="tech_spec"):
            self._lock(svc, tech_spec="  ")

    def test_resolves_title_from_taiga_when_not_provided(self):
        svc, _, ctx_svc, _ = _service()
        self._lock(svc, epic_title="")
        assert ctx_svc.appended_tech[1] == "Authentication"

    def test_falls_back_to_index_stories_when_story_ids_empty(self):
        svc, _, ctx_svc, _ = _service()
        self._lock(svc, story_ids=[])
        # _stories_for_epic(7) returns stories 10 and 11
        assert sorted(ctx_svc.appended_tech[2]) == [10, 11]

    def test_raises_when_no_story_ids_and_none_in_index(self):
        svc, _, _, _ = _service(context=FakeContextService(index={}))
        with pytest.raises(Phase2ValidationError, match="At least one story_id"):
            self._lock(svc, story_ids=[])


# ---------------------------------------------------------------------------
# _extract_tech_stack (tested via tech_stack_status)
# ---------------------------------------------------------------------------

class TestExtractTechStack:
    def _status(self, memory_bank):
        svc, _, _, _ = _service(context=FakeContextService(memory_bank=memory_bank))
        return svc.tech_stack_status(_ctx())

    def test_extracts_single_line_stack(self):
        result = self._status("## Tech Stack\n\nReact + FastAPI\n\n## Other\n\n")
        assert result["tech_stack"] == "React + FastAPI"

    def test_extracts_multiline_stack(self):
        mb = "## Tech Stack\n\n- Next.js\n- FastAPI\n- PostgreSQL\n\n## Other\n"
        result = self._status(mb)
        assert "Next.js" in result["tech_stack"]
        assert "PostgreSQL" in result["tech_stack"]

    def test_placeholder_comment_returns_none(self):
        result = self._status("## Tech Stack\n\n<!-- placeholder -->\n\n## Other\n")
        assert result["tech_stack"] is None

    def test_missing_section_returns_none(self):
        result = self._status("## Project Concept\n\nNo tech here.\n")
        assert result["tech_stack"] is None

    def test_stops_at_next_section(self):
        mb = "## Tech Stack\n\nFastAPI\n\n## Architecture Principles\n\nKeep it simple.\n"
        result = self._status(mb)
        assert "Architecture" not in result["tech_stack"]


# ---------------------------------------------------------------------------
# API route layer — happy path
# ---------------------------------------------------------------------------

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

    def lock_epic_design(self, ctx, *, epic_id, epic_title, story_ids, wireframes, user_flow, component_tree, tech_spec):
        return {"ok": True, "epic_id": epic_id, "story_ids": story_ids, "taiga_failures": []}


def _rctx():
    return get_request_context("Bearer tok", 42)


class TestApiRoutes:
    def test_tech_stack_status_route(self):
        result = tech_stack_status(ctx=_rctx(), service=StubPhase2Service())
        assert result == {"defined": True, "tech_stack": "FastAPI"}

    def test_eligible_epics_route(self):
        result = eligible_epics(ctx=_rctx(), service=StubPhase2Service())
        assert result[0]["epic_id"] == 7

    def test_propose_tech_stack_hint_forwarded(self):
        result = propose_tech_stack(
            ProposeTechStackRequest(hint="Python please"),
            ctx=_rctx(),
            service=StubPhase2Service(),
        )
        assert result["alternatives"][0]["description"] == "Python please"

    def test_lock_tech_stack_route(self):
        result = lock_tech_stack(LockTechStackRequest(tech_stack="FastAPI"), ctx=_rctx(), service=StubPhase2Service())
        assert result == {"defined": True, "tech_stack": "FastAPI"}

    def test_generate_design_bundle_route(self):
        result = generate_design_bundle(GenerateDesignBundleRequest(epic_id=7), ctx=_rctx(), service=StubPhase2Service())
        assert result["story_ids"] == [10]

    def test_lock_epic_design_route(self):
        result = lock_epic_design(
            LockEpicDesignRequest(
                epic_id=7,
                epic_title="Auth",
                story_ids=[10],
                wireframes="SCREEN",
                user_flow="flowchart TD",
                component_tree="App",
                tech_spec="openapi: 3.0.0",
            ),
            ctx=_rctx(),
            service=StubPhase2Service(),
        )
        assert result == {"ok": True, "epic_id": 7, "story_ids": [10], "taiga_failures": []}


# ---------------------------------------------------------------------------
# API route layer — error mapping
# ---------------------------------------------------------------------------

class TestApiErrorMapping:
    def test_validation_error_maps_to_409(self):
        class FailSvc(StubPhase2Service):
            def tech_stack_status(self, ctx):
                raise Phase2ValidationError("Missing stack")

        with pytest.raises(HTTPException) as exc:
            tech_stack_status(ctx=_rctx(), service=FailSvc())
        assert exc.value.status_code == 409

    def test_taiga_error_maps_to_502(self):
        class FailSvc(StubPhase2Service):
            def eligible_epics(self, ctx):
                raise TaigaAPIError("GET", "https://api.taiga.io/epics", 503, "service unavailable")

        with pytest.raises(HTTPException) as exc:
            eligible_epics(ctx=_rctx(), service=FailSvc())
        assert exc.value.status_code == 502

    def test_ai_error_maps_to_502(self):
        class FailSvc(StubPhase2Service):
            def propose_tech_stack(self, ctx, *, hint=""):
                raise AIError("Model overloaded")

        with pytest.raises(HTTPException) as exc:
            propose_tech_stack(ProposeTechStackRequest(), ctx=_rctx(), service=FailSvc())
        assert exc.value.status_code == 502

    def test_ai_rate_limit_error_maps_to_502(self):
        class FailSvc(StubPhase2Service):
            def generate_design_bundle(self, ctx, *, epic_id):
                raise AIRateLimitError("Rate limited")

        with pytest.raises(HTTPException) as exc:
            generate_design_bundle(GenerateDesignBundleRequest(epic_id=7), ctx=_rctx(), service=FailSvc())
        assert exc.value.status_code == 502

    def test_unknown_errors_bubble_up(self):
        class FailSvc(StubPhase2Service):
            def lock_tech_stack(self, ctx, *, tech_stack):
                raise RuntimeError("unexpected crash")

        with pytest.raises(RuntimeError, match="unexpected crash"):
            lock_tech_stack(LockTechStackRequest(tech_stack="X"), ctx=_rctx(), service=FailSvc())
