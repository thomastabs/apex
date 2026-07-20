"""Tests for the Phase 3 backend service (implementation assist)."""

import pytest

from backend.app.services.phase3_service import Phase3Service, Phase3ValidationError
from backend.app.services.request_context import RequestContext


_FAKE_GHERKIN = "Feature: Login\n  Scenario: Successful login\n    Given a registered user\n    When they submit valid credentials\n    Then they receive a JWT token"

_FAKE_TECH_SPEC = "## Endpoints\n- `POST /auth/login` · auth:none · in:{email:str,password:str} · out:{token:str}"

_FAKE_DESIGN_BUNDLE = "## UX Brief\n- Login screen\n## Endpoints\n- POST /auth/login\n## Data Model\n### User\n- Fields: id, email"

_FAKE_TECH_STACK = "FastAPI + Next.js + PostgreSQL"

_FAKE_TASKS = [
    {"id": 1, "subject": "Create User model and migration", "description": "Define SQLAlchemy User model."},
    {"id": 2, "subject": "Implement POST /auth/login endpoint", "description": "Validate credentials and return JWT."},
]

_FAKE_PROPOSAL = (
    "## Context\nImplementing login endpoint.\n\n"
    "## Implementation Steps\n1. Create endpoint.\n\n"
    "## Test Assertions\n- POST /auth/login returns 200.\n\n"
    "## AI Prompt\nYou are implementing..."
)


class FakeAiService:
    def __init__(self):
        self.generate_tasks_args = None
        self.generate_proposal_args = None
        self.generate_proposal_kwargs: dict = {}

    def generate_tasks(self, story_subject, gherkin, technical_spec, tech_stack="", design_bundle="", github_context="", instructions="", figma_context="", runtime_spec=""):
        self.generate_tasks_args = (story_subject, gherkin, technical_spec, tech_stack, design_bundle)
        self.generate_tasks_figma_context = figma_context
        self.generate_tasks_runtime_spec = runtime_spec
        return _FAKE_TASKS

    def generate_proposal(
        self,
        task_subject,
        task_description,
        gherkin,
        technical_spec,
        tech_stack="",
        design_bundle="",
        story_ref="",
        github_context="",
        hint="",
        recent_commits="",
        other_tasks=None,
        sibling_packs=None,
        constraints="",
        decisions="",
        figma_context="",
        images=None,
        runtime_spec="",
    ):
        self.generate_proposal_args = (task_subject, task_description, gherkin, technical_spec,
                                       tech_stack, design_bundle, story_ref)
        self.generate_proposal_kwargs = {
            "hint": hint,
            "recent_commits": recent_commits,
            "other_tasks": other_tasks,
            "sibling_packs": sibling_packs,
            "constraints": constraints,
            "decisions": decisions,
            "figma_context": figma_context,
            "images": images,
            "runtime_spec": runtime_spec,
        }
        return _FAKE_PROPOSAL


class FakeContextService:
    def __init__(self, index=None):
        self.project_id = 0
        self.index = index if index is not None else _story_index()
        self.saved_proposals: list[tuple] = []
        self.upserted: list[tuple] = []
        self.bolt_records: dict[tuple, dict] = {}

    def set_active(self, ctx):
        self.set_project(ctx.project_id)

    def set_project(self, project_id: int):
        self.project_id = project_id

    def story_index(self):
        return self.index

    def load_proposals(self, story_id: int) -> list[dict]:
        return getattr(self, "proposals", [])

    def story_gherkin(self, story_id: int) -> str:
        return _FAKE_GHERKIN

    def story_technical_spec(self, story_id: int) -> str:
        return _FAKE_TECH_SPEC

    def story_design_bundle(self, story_id: int) -> str:
        return _FAKE_DESIGN_BUNDLE

    def read_project_concept(self) -> str:
        return "A project about authentication."

    def read_tech_stack(self) -> str:
        return _FAKE_TECH_STACK

    def read_context_file(self, filename: str) -> str:
        return getattr(self, "context_files", {}).get(filename, _FAKE_DESIGN_BUNDLE)

    def save_proposal(self, story_id: int, task_id: int, proposal_md: str) -> None:
        self.saved_proposals.append((story_id, task_id, proposal_md))

    def load_all_proposals(self) -> list[dict]:
        return getattr(self, "all_proposals", [])

    def upsert_story_index(self, story_id: int, **updates) -> None:
        self.upserted.append((story_id, updates))

    def proposal_exists(self, story_id: int, task_id: int) -> bool:
        return any(s == story_id and t == task_id for s, t, _ in self.saved_proposals)

    def record_task_bolt_status(self, story_id: int, task_id: int, status: str) -> dict:
        key = (story_id, task_id)
        record = self.bolt_records.setdefault(key, {"task_id": task_id, "status": status, "status_history": {}})
        record["status"] = status
        # Always later than any preset "2026-01-01..." timestamp a test seeds.
        record.setdefault("status_history", {}).setdefault(status, []).append("2026-01-02T00:00:00+00:00")
        return record


def _story_index(status: str = "design_locked") -> dict:
    return {
        "10": {
            "story_id": 10,
            "epic_id": 1,
            "epic_title": "Authentication",
            "title": "User Login",
            "phase_status": status,
            "has_gherkin": True,
            "has_proposal": False,
        }
    }


def _ctx() -> RequestContext:
    return RequestContext(pm_token="tok", project_id=1)


# ---------------------------------------------------------------------------
# get_eligible_stories
# ---------------------------------------------------------------------------

def test_eligible_stories_returns_design_locked():
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService())
    stories = svc.get_eligible_stories(_ctx())
    assert len(stories) == 1
    assert stories[0]["story_id"] == 10
    assert stories[0]["title"] == "User Login"


def test_eligible_stories_open_through_testing_excludes_pre_design_and_deployed():
    index = {
        "1": {"story_id": 1, "title": "A", "phase_status": "gherkin_locked", "epic_title": "X"},
        "2": {"story_id": 2, "title": "B", "phase_status": "implementation", "epic_title": "X"},
        "3": {"story_id": 3, "title": "C", "phase_status": "design_locked", "epic_title": "X"},
        "4": {"story_id": 4, "title": "D", "phase_status": "qa", "epic_title": "X"},
        "5": {"story_id": 5, "title": "E", "phase_status": "qa_passed", "epic_title": "X"},
        "6": {"story_id": 6, "title": "F", "phase_status": "deployed", "epic_title": "X"},
    }
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService(index=index))
    stories = svc.get_eligible_stories(_ctx())
    # design_locked, implementation, qa, qa_passed listed; gherkin_locked + deployed excluded
    assert [s["story_id"] for s in stories] == [2, 3, 4, 5]
    # phase_status is exposed so the picker can badge already-locked stories
    # (Autopilot or a prior manual lock may have already decomposed them).
    by_id = {s["story_id"]: s["phase_status"] for s in stories}
    assert by_id == {2: "implementation", 3: "design_locked", 4: "qa", 5: "qa_passed"}


def test_eligible_stories_exposes_has_proposal_independent_of_phase_status():
    # A story can have packs generated (tasks decomposed) without being locked
    # yet — has_proposal and phase_status must not be conflated by the picker.
    index = {
        "1": {"story_id": 1, "title": "A", "phase_status": "design_locked", "epic_title": "X", "has_proposal": True},
        "2": {"story_id": 2, "title": "B", "phase_status": "design_locked", "epic_title": "X", "has_proposal": False},
    }
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService(index=index))
    stories = svc.get_eligible_stories(_ctx())
    by_id = {s["story_id"]: s["has_proposal"] for s in stories}
    assert by_id == {1: True, 2: False}


def test_eligible_stories_exposes_is_scaffold():
    index = {
        "1": {"story_id": 1, "title": "A", "phase_status": "design_locked", "epic_title": "X", "is_scaffold": True},
        "2": {"story_id": 2, "title": "B", "phase_status": "design_locked", "epic_title": "X", "is_scaffold": False},
    }
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService(index=index))
    stories = svc.get_eligible_stories(_ctx())
    by_id = {s["story_id"]: s["is_scaffold"] for s in stories}
    assert by_id == {1: True, 2: False}


# ---------------------------------------------------------------------------
# get_story_context
# ---------------------------------------------------------------------------

def test_get_story_context_returns_all_fields():
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService())
    ctx_data = svc.get_story_context(_ctx(), 10)
    assert ctx_data["story_id"] == 10
    assert ctx_data["gherkin"] == _FAKE_GHERKIN
    assert ctx_data["technical_spec"] == _FAKE_TECH_SPEC
    assert ctx_data["design_bundle"] == _FAKE_DESIGN_BUNDLE
    assert ctx_data["tech_stack"] == _FAKE_TECH_STACK


def test_get_story_context_raises_for_unknown_story():
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService())
    with pytest.raises(Phase3ValidationError, match="not found"):
        svc.get_story_context(_ctx(), 999)


# ---------------------------------------------------------------------------
# generate_tasks
# ---------------------------------------------------------------------------

def test_generate_tasks_returns_tasks():
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())
    tasks = svc.generate_tasks(_ctx(), 10)
    assert len(tasks) == 2
    assert tasks[0]["subject"] == "Create User model and migration"


def test_generate_tasks_passes_full_context_to_ai():
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())
    svc.generate_tasks(_ctx(), 10)
    _, _, _, tech_stack, design_bundle = ai.generate_tasks_args
    assert tech_stack == _FAKE_TECH_STACK
    assert design_bundle == _FAKE_DESIGN_BUNDLE


def test_generate_tasks_rejects_pre_design_status():
    index = _story_index(status="gherkin_locked")
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService(index=index))
    with pytest.raises(Phase3ValidationError, match="not ready for task decomposition"):
        svc.generate_tasks(_ctx(), 10)


def test_generate_tasks_allowed_in_implementation():
    index = _story_index(status="implementation")
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService(index=index))
    tasks = svc.generate_tasks(_ctx(), 10)
    assert len(tasks) == 2


def test_generate_tasks_injects_figma_context():
    # A: design-system tokens/screens ground task decomposition.
    ai = FakeAiService()
    ctx_svc = FakeContextService()
    ctx_svc.context_files = {"figma-context.md": "## Design system\n### Components\nButton, Card"}
    svc = Phase3Service(ai=ai, context=ctx_svc)
    svc.generate_tasks(_ctx(), 10)
    assert "Button, Card" in ai.generate_tasks_figma_context


def test_generate_tasks_injects_runtime_spec():
    # Task decomposition grounds itself in the locked Runtime Contract (app
    # paths, migration command, ...) when one exists.
    ai = FakeAiService()
    ctx_svc = FakeContextService()
    ctx_svc.context_files = {"runtime-spec.md": "## Runtime Contract\n- **app root** {RT-1}: frontend/app"}
    svc = Phase3Service(ai=ai, context=ctx_svc)
    svc.generate_tasks(_ctx(), 10)
    assert "app root" in ai.generate_tasks_runtime_spec


def test_generate_tasks_runtime_spec_empty_when_never_generated():
    ai = FakeAiService()
    ctx_svc = FakeContextService()
    ctx_svc.read_context_file = lambda filename: ""  # runtime-spec.md never generated
    svc = Phase3Service(ai=ai, context=ctx_svc)
    svc.generate_tasks(_ctx(), 10)
    assert ai.generate_tasks_runtime_spec == ""


# ---------------------------------------------------------------------------
# generate_proposal
# ---------------------------------------------------------------------------

def test_generate_proposal_returns_markdown():
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService())
    md = svc.generate_proposal(_ctx(), 10, 1, "Implement endpoint", "Create the login route.")
    assert "## Context" in md
    assert "## Implementation Steps" in md
    assert "## AI Prompt" in md


def test_generate_proposal_allowed_after_lock_in_implementation():
    # A locked story sits at 'implementation'; generating its remaining packs
    # must still work (regression: guard previously required design_locked).
    ctx_svc = FakeContextService(index=_story_index(status="implementation"))
    svc = Phase3Service(ai=FakeAiService(), context=ctx_svc)
    md = svc.generate_proposal(_ctx(), 10, 1, "Implement endpoint", "Create the login route.")
    assert "## Context" in md


def test_generate_proposal_rejects_pre_design_status():
    ctx_svc = FakeContextService(index=_story_index(status="gherkin_locked"))
    svc = Phase3Service(ai=FakeAiService(), context=ctx_svc)
    with pytest.raises(Phase3ValidationError, match="not ready for developer packs"):
        svc.generate_proposal(_ctx(), 10, 1, "Implement endpoint", "Create the login route.")


def test_generate_proposal_injects_runtime_spec():
    ai = FakeAiService()
    ctx_svc = FakeContextService()
    ctx_svc.context_files = {"runtime-spec.md": "## Runtime Contract\n- **health endpoint** {RT-1}: GET /health"}
    svc = Phase3Service(ai=ai, context=ctx_svc)
    svc.generate_proposal(_ctx(), 10, 1, "Implement endpoint", "Create the login route.")
    assert "health endpoint" in ai.generate_proposal_kwargs["runtime_spec"]


def test_generate_proposal_runtime_spec_empty_when_never_generated():
    ai = FakeAiService()
    ctx_svc = FakeContextService()
    ctx_svc.read_context_file = lambda filename: ""
    svc = Phase3Service(ai=ai, context=ctx_svc)
    svc.generate_proposal(_ctx(), 10, 1, "Implement endpoint", "Create the login route.")
    assert ai.generate_proposal_kwargs["runtime_spec"] == ""


def test_generate_proposal_injects_figma_context():
    # A: figma design system flows into the developer pack.
    ai = FakeAiService()
    ctx_svc = FakeContextService()
    ctx_svc.context_files = {"figma-context.md": "## Design system\n### Color tokens\n- Primary/500 — #1A73E8"}
    svc = Phase3Service(ai=ai, context=ctx_svc)
    svc.generate_proposal(_ctx(), 10, 1, "Build login screen", "UI")
    assert "Primary/500" in ai.generate_proposal_kwargs["figma_context"]


def test_generate_proposal_renders_linked_frame_image(monkeypatch):
    # B: a linked frame + token → render that frame and attach it to the pack.
    index = _story_index()
    index["10"]["figma_node_id"] = "1:1"
    index["10"]["figma_file_key"] = "FILEK"
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService(index=index))
    import backend.app.services.figma_fetch as ff
    captured = {}

    def _imgs(token, file_key, frames):
        captured["args"] = (token, file_key, [f["node_id"] for f in frames])
        return [{"node_id": "1:1", "name": "Login", "b64_png": "X", "media_type": "image/png"}]

    monkeypatch.setattr(ff, "fetch_frame_images", _imgs)
    svc.generate_proposal(_ctx(), 10, 1, "Build login screen", "UI", figma_token="tok")
    assert captured["args"] == ("tok", "FILEK", ["1:1"])
    imgs = ai.generate_proposal_kwargs["images"]
    assert imgs and imgs[0]["node_id"] == "1:1"


def test_generate_proposal_no_image_without_link_or_token():
    # No linked frame → no image even with a token; no token → no image even if linked.
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())  # story has no figma_node_id
    svc.generate_proposal(_ctx(), 10, 1, "Build login screen", "UI", figma_token="tok")
    assert ai.generate_proposal_kwargs["images"] is None


def test_generate_proposal_passes_sibling_packs_excluding_self():
    ctx_svc = FakeContextService()
    ctx_svc.proposals = [
        {"task_id": 1, "proposal_md": "## Context\nTask one."},
        {"task_id": 2, "proposal_md": "## Context\nTask two."},
    ]
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=ctx_svc)
    # all_tasks gives subjects for labelling; generating for task 1 → sibling = task 2 only
    svc.generate_proposal(
        _ctx(), 10, 1, "Implement endpoint", "Create the login route.",
        all_tasks=[{"id": 1, "subject": "A"}, {"id": 2, "subject": "B"}],
    )
    siblings = ai.generate_proposal_kwargs["sibling_packs"]
    assert [s["task_id"] if "task_id" in s else s["subject"] for s in siblings] == ["B"]
    assert siblings[0]["proposal_md"] == "## Context\nTask two."


def test_generate_proposal_passes_design_context():
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())
    svc.generate_proposal(_ctx(), 10, 1, "Implement endpoint", "Create the login route.")
    args = ai.generate_proposal_args
    tech_stack = args[4]
    design_bundle = args[5]
    assert tech_stack == _FAKE_TECH_STACK
    assert design_bundle == _FAKE_DESIGN_BUNDLE


# ---------------------------------------------------------------------------
# save_proposal
# ---------------------------------------------------------------------------

def test_save_proposal_delegates_to_context():
    ctx_svc = FakeContextService()
    svc = Phase3Service(ai=FakeAiService(), context=ctx_svc)
    svc.save_proposal(_ctx(), 10, 1, "## Context\nHello.")
    assert len(ctx_svc.saved_proposals) == 1
    assert ctx_svc.saved_proposals[0] == (10, 1, "## Context\nHello.")


# ---------------------------------------------------------------------------
# update_bolt_status (Bolt Board)
# ---------------------------------------------------------------------------

def test_update_bolt_status_pushed_has_no_cycle_hours():
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService())
    result = svc.update_bolt_status(_ctx(), 10, 1, "pushed")
    assert result["status"] == "pushed"
    assert result["cycle_hours"] is None


def test_update_bolt_status_done_computes_cycle_hours_from_pack_ready():
    ctx_svc = FakeContextService()
    ctx_svc.bolt_records[(10, 1)] = {
        "task_id": 1,
        "status": "pushed",
        "status_history": {"pack_ready": ["2026-01-01T10:00:00+00:00"]},
    }
    svc = Phase3Service(ai=FakeAiService(), context=ctx_svc)
    result = svc.update_bolt_status(_ctx(), 10, 1, "done")
    assert result["status"] == "done"
    assert result["cycle_hours"] is not None
    assert result["cycle_hours"] >= 0


def test_update_bolt_status_done_without_pack_ready_leaves_cycle_hours_none():
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService())
    result = svc.update_bolt_status(_ctx(), 10, 1, "done")
    assert result["status"] == "done"
    assert result["cycle_hours"] is None


def test_update_bolt_status_requires_known_story():
    svc = Phase3Service(ai=FakeAiService(), context=FakeContextService())
    with pytest.raises(Phase3ValidationError):
        svc.update_bolt_status(_ctx(), 999, 1, "done")


# ---------------------------------------------------------------------------
# lock_story
# ---------------------------------------------------------------------------

def test_lock_story_transitions_to_implementation():
    ctx_svc = FakeContextService()
    ctx_svc.saved_proposals.append((10, 1, "## pack"))
    svc = Phase3Service(ai=FakeAiService(), context=ctx_svc)
    svc.lock_story(_ctx(), 10, [1])
    assert len(ctx_svc.upserted) == 1
    story_id, updates = ctx_svc.upserted[0]
    assert story_id == 10
    assert updates["phase_status"] == "implementation"
    assert updates["has_proposal"] is True


# ---------------------------------------------------------------------------
# generate_proposal — hint / all_tasks / recent_commits passthrough
# ---------------------------------------------------------------------------

def test_generate_proposal_passes_hint_to_ai():
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())
    svc.generate_proposal(_ctx(), 10, 1, "Implement endpoint", "Build it.", hint="prefer async")
    assert ai.generate_proposal_kwargs["hint"] == "prefer async"


def test_generate_proposal_passes_recent_commits_to_ai():
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())
    svc.generate_proposal(
        _ctx(), 10, 1, "Implement endpoint", "Build it.",
        recent_commits_context="- abc123: add auth module",
    )
    assert ai.generate_proposal_kwargs["recent_commits"] == "- abc123: add auth module"


def test_generate_proposal_filters_current_task_from_all_tasks():
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())
    all_tasks = [
        {"id": 1, "subject": "Implement endpoint", "description": "current task"},
        {"id": 2, "subject": "Write migration", "description": "another task"},
    ]
    svc.generate_proposal(
        _ctx(), 10, 1, "Implement endpoint", "Build it.",
        all_tasks=all_tasks,
    )
    other = ai.generate_proposal_kwargs["other_tasks"]
    subjects = [t["subject"] for t in other]
    assert "Implement endpoint" not in subjects
    assert "Write migration" in subjects


def test_generate_proposal_empty_hint_passes_through():
    ai = FakeAiService()
    svc = Phase3Service(ai=ai, context=FakeContextService())
    svc.generate_proposal(_ctx(), 10, 1, "Implement endpoint", "Build it.")
    assert ai.generate_proposal_kwargs["hint"] == ""


