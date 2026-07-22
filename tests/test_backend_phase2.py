"""Tests for the Phase 2 backend service (unified project design bundle)."""

import pytest

from backend.app.services.phase2_service import (
    Phase2Service,
    Phase2ValidationError,
    build_screen_flow_diagram,
)
from backend.app.services.request_context import RequestContext
from src.ai_engine import DesignSystemData, DesignSystemScreen
from tests.fake_context_service import FakeContextServiceBase


_FAKE_SECTION_CONTENT = {
    "ux_brief":   "## Screens\n- Login\n## Navigation Paths\n- Login → Dashboard",
    "endpoints":  "## Endpoints\n### Auth\n- `POST /auth/login` — login (Story 10)",
    "data_model": "## Data Model\n### User\n- Fields: id:int, email:str",
    "runtime":    "## Runtime Contract\n- **app root** {RT-1}: frontend/app",
}


class FakeAiService:
    def __init__(self):
        self.tech_stack_args = None
        self.section_args: list[tuple] = []
        self.delta_args = None
        self.delta_result = {
            "ux_brief_addendum": "New screen: Reports",
            "endpoints_delta": "- `GET /api/reports` — list (Story 10)",
            "data_model_delta": "### Report\n- Fields: id:int",
            "touches_existing": [],
        }

    def suggest_tech_stack(self, all_stories, context, hint):
        self.tech_stack_args = (all_stories, context, hint)
        return [{"name": "FastAPI + Next.js", "description": "Good fit.", "trade_offs": "+ simple"}]

    def generate_design_section(self, all_stories, context, section, prior_sections, instructions="") -> str:
        self.section_args.append((all_stories, context, section, prior_sections))
        return _FAKE_SECTION_CONTENT[section]

    def generate_design_delta(self, new_stories, context, existing_design, instructions="", next_ids=None):
        self.delta_args = (new_stories, context, existing_design, instructions)
        self.delta_next_ids = next_ids
        return dict(self.delta_result)

    def generate_design_system(self, ux_brief_md, instructions=""):
        self.design_system_args = ux_brief_md
        self.design_system_instructions = instructions
        state = {"background": "#4F46E5", "text_color": "#FFFFFF"}
        return DesignSystemData(
            colors=[{"name": "primary", "hex": "#4F46E5", "usage": "Buttons"}],
            typography={"font_family": "Inter, sans-serif", "styles": [{"role": "body", "size_px": 15, "weight": 400}]},
            navigation={"pattern": "topbar", "items": ["Home"], "justification": "Simple product"},
            screens=[
                {"id": "dashboard", "label": "Dashboard", "archetype": "dashboard", "blocks": []},
                {"id": "detail", "label": "Detail", "archetype": "detail", "blocks": []},
            ],
            component_states=[
                {"component": "button", "default": state, "hover": state, "disabled": state, "error": state},
            ],
        )

    def generate_design_system_screen(
        self, ux_brief_md, *, colors, typography, navigation, existing_screens, screen_id=None, instructions="",
    ):
        # Snapshot existing_screens — the service mutates that same list object
        # in place right after this call returns (splice/append), so capturing
        # the live reference would show post-mutation state, not what was
        # actually passed at call time.
        self.screen_args = {
            "ux_brief_md": ux_brief_md, "colors": colors, "typography": typography,
            "navigation": navigation, "existing_screens": list(existing_screens),
            "screen_id": screen_id, "instructions": instructions,
        }
        from src.ai_engine import DesignSystemScreen
        return self.screen_result if hasattr(self, "screen_result") else DesignSystemScreen(
            id="ai-picked-id", label="Regenerated", archetype="form", blocks=[],
        )


class FakeContextService(FakeContextServiceBase):
    def __init__(self, tech_stack=None, project_concept=None, index=None):
        super().__init__(index if index is not None else _story_index())
        self.tech_stack = tech_stack if tech_stack is not None else _tech_stack_with_content()
        self.project_concept = project_concept if project_concept is not None else "Test project."
        self.written_stack = None
        self.written_bundle = None
        self.written_tech_spec = None

    def read_tech_stack(self):
        return self.tech_stack

    def read_project_concept(self):
        return self.project_concept

    def write_tech_stack(self, tech_stack):
        self.written_stack = tech_stack

    def story_index(self):
        return self.index

    def story_gherkin(self, story_id):
        return f"### Story {story_id}\n\n```gherkin\nFeature: Story {story_id}\n```"

    def write_project_design_bundle(self, ux_brief: str) -> None:
        self.written_bundle = ux_brief

    def write_project_technical_spec(self, story_ids, endpoints, data_model):
        self.written_tech_spec = (story_ids, endpoints, data_model)

    def write_project_runtime_spec(self, story_ids, runtime_spec):
        self.written_runtime_spec = (story_ids, runtime_spec)

    def read_context_file(self, filename: str) -> str:
        return getattr(self, "files", {}).get(filename, "")

    def read_project_design_bundle(self):
        return {"ux_brief": "UX brief body", "endpoints": "", "data_model": ""}

    def append_design_delta(self, story_ids, ux_brief_addendum, endpoints_delta, data_model_delta):
        self.appended_delta = (story_ids, ux_brief_addendum, endpoints_delta, data_model_delta)
        return {
            "locked_at": "now",
            "story_ids": sorted(story_ids),
            "versions": {"technical-spec.md": "1.1.0"},
        }

    def record_amendment(self, filename, note, story_ids):
        self.amendments = getattr(self, "amendments", [])
        self.amendments.append((filename, note, story_ids))

    def affected_stories_for_spec(self, filename):
        return getattr(self, "affected", [])

    def save_screen_flow(self, diagram) -> None:
        self.saved_screen_flow = diagram

    def save_design_system(self, design_system) -> None:
        self.saved_design_system = design_system

    def load_design_system(self):
        return getattr(self, "saved_design_system", None)


def _tech_stack_with_content():
    return "FastAPI + Next.js + PostgreSQL"


def _tech_stack_empty():
    return ""


def _story_index():
    return {
        "10": {
            "story_id": 10,
            "epic_id": 7,
            "epic_title": "Authentication",
            "title": "Login",
            "phase_status": "gherkin_locked",
            "has_gherkin": True,
        },
        "11": {
            "story_id": 11,
            "epic_id": 7,
            "epic_title": "Authentication",
            "title": "Logout",
            "phase_status": "design_locked",
            "has_gherkin": True,
        },
        "12": {
            "story_id": 12,
            "epic_id": 9,
            "epic_title": "Billing",
            "title": "Pending Billing",
            "phase_status": "pending",
            "has_gherkin": False,
        },
    }


def _ctx():
    return RequestContext(pm_token="token", project_id=42)


def _service(context=None):
    ai = FakeAiService()
    context = context or FakeContextService()
    return Phase2Service(ai=ai, context=context), ai, context


class TestBuildScreenFlowDiagram:
    FRAMES = [
        {"node_id": "1:1", "name": "Login", "page": "Auth"},
        {"node_id": "1:2", "name": "Dashboard", "page": "Auth"},
    ]

    def test_frames_become_nodes_with_label_and_page(self):
        d = build_screen_flow_diagram(self.FRAMES, [])
        assert [n["id"] for n in d["nodes"]] == ["1:1", "1:2"]
        assert d["nodes"][0]["data"] == {"label": "Login", "description": "Auth"}
        assert d["nodes"][0]["type"] == "screen"

    def test_flows_map_names_to_node_ids(self):
        d = build_screen_flow_diagram(self.FRAMES, [{"from_name": "Login", "to_name": "Dashboard"}])
        assert d["edges"] == [
            {"id": "1:1->1:2", "source": "1:1", "target": "1:2", "label": "", "animated": False},
        ]

    def test_drops_unknown_self_and_duplicate_edges(self):
        flows = [
            {"from_name": "Login", "to_name": "Ghost"},      # unknown target
            {"from_name": "Login", "to_name": "Login"},       # self-loop
            {"from_name": "Login", "to_name": "Dashboard"},
            {"from_name": "Login", "to_name": "Dashboard"},   # duplicate
        ]
        d = build_screen_flow_diagram(self.FRAMES, flows)
        assert len(d["edges"]) == 1

    def test_extra_edges_append_cross_file_links(self):
        d = build_screen_flow_diagram(
            self.FRAMES, [], extra_edges=[{"from_id": "1:1", "to_id": "1:2", "kind": "cross_file"}],
        )
        assert d["edges"][-1] == {
            "id": "1:1->1:2", "source": "1:1", "target": "1:2",
            "label": "cross-file", "animated": False, "data": {"kind": "cross_file"},
        }

    def test_extra_edges_drop_unknown_node_ids(self):
        d = build_screen_flow_diagram(
            self.FRAMES, [], extra_edges=[{"from_id": "1:1", "to_id": "ZZZ"}],
        )
        assert d["edges"] == []

    def test_omitting_extra_edges_is_unchanged(self):
        assert build_screen_flow_diagram(self.FRAMES, []) == build_screen_flow_diagram(self.FRAMES, [], None)


class TestStitchCrossFileFlows:
    def test_links_frames_sharing_a_name_across_files(self):
        from backend.app.services.figma_fetch import stitch_cross_file_flows

        bundles = [
            {"file_key": "K1", "frames": [{"node_id": "1:1", "name": "Login"}, {"node_id": "1:2", "name": "Dashboard"}]},
            {"file_key": "K2", "frames": [{"node_id": "9:9", "name": "Dashboard"}, {"node_id": "9:8", "name": "Settings"}]},
        ]
        edges = stitch_cross_file_flows(bundles)
        assert edges == [{"from_id": "K1:1:2", "to_id": "K2:9:9", "kind": "cross_file"}]

    def test_no_edge_for_unique_or_same_file_names(self):
        from backend.app.services.figma_fetch import stitch_cross_file_flows

        bundles = [
            {"file_key": "K1", "frames": [{"node_id": "1:1", "name": "A"}, {"node_id": "1:2", "name": "A"}]},
            {"file_key": "K2", "frames": [{"node_id": "9:1", "name": "B"}]},
        ]
        assert stitch_cross_file_flows(bundles) == []


def test_build_screen_flow_from_figma_saves_and_returns():
    service, _, context = _service()
    out = service.build_screen_flow_from_figma(
        _ctx(),
        frames=[{"node_id": "1:1", "name": "Login", "page": "Auth"}],
        flows=[],
    )
    assert out["nodes"][0]["id"] == "1:1"
    assert context.saved_screen_flow == out


def test_build_screen_flow_from_figma_empty_frames_raises():
    service, _, _ = _service()
    with pytest.raises(Phase2ValidationError):
        service.build_screen_flow_from_figma(_ctx(), frames=[], flows=[])


def test_tech_stack_status_detects_locked_stack():
    service, _, context = _service()

    status = service.tech_stack_status(_ctx())

    assert status == {"defined": True, "tech_stack": "FastAPI + Next.js + PostgreSQL"}
    assert context.project_id == 42


def test_tech_stack_status_ignores_placeholder_stack():
    service, _, _ = _service(context=FakeContextService(tech_stack=_tech_stack_empty()))

    assert service.tech_stack_status(_ctx()) == {"defined": False, "tech_stack": None}


def test_propose_tech_stack_requires_locked_stories():
    empty_index = {"1": {"story_id": 1, "epic_id": 7, "phase_status": "pending", "has_gherkin": False}}
    service, _, _ = _service(context=FakeContextService(index=empty_index))

    with pytest.raises(Phase2ValidationError, match="No Phase 1 locked"):
        service.propose_tech_stack(_ctx())


def test_propose_tech_stack_passes_all_locked_stories_to_ai():
    service, ai, _ = _service()

    alternatives = service.propose_tech_stack(_ctx(), hint="Prefer Python")

    assert alternatives[0]["name"] == "FastAPI + Next.js"
    stories, tech_stack, hint = ai.tech_stack_args
    assert len(stories) == 2
    assert "FastAPI" in tech_stack
    assert hint == "Prefer Python"


def test_lock_tech_stack_saves_tech_stack():
    service, _, context = _service()

    status = service.lock_tech_stack(_ctx(), tech_stack=" Django + React ")

    assert status == {"defined": True, "tech_stack": "Django + React"}
    assert context.written_stack == "Django + React"


def test_generate_design_section_requires_locked_tech_stack():
    service, _, _ = _service(context=FakeContextService(tech_stack=_tech_stack_empty()))

    with pytest.raises(Phase2ValidationError, match="Tech Stack"):
        service.generate_design_section(_ctx(), section="ux_brief")


def test_generate_design_section_requires_eligible_stories():
    empty_index = {"1": {"story_id": 1, "epic_id": 7, "phase_status": "pending", "has_gherkin": False}}
    service, _, _ = _service(context=FakeContextService(index=empty_index))

    with pytest.raises(Phase2ValidationError, match="No Phase 1 locked"):
        service.generate_design_section(_ctx(), section="endpoints")


def test_generate_design_section_runtime_includes_stories_past_design_locked():
    # ux_brief/endpoints/data_model stay pre-implementation-only (gherkin_locked/
    # design_locked); Runtime Contract is project-wide infra and must still be
    # generatable for a project that's already deep in implementation/testing —
    # this is the exact "No Phase 1 locked Gherkin stories found" bug report.
    index = {
        **_story_index(),
        "20": {
            "story_id": 20, "epic_id": 7, "epic_title": "Authentication", "title": "MFA",
            "phase_status": "qa_passed", "has_gherkin": True,
        },
    }
    service, ai, _ = _service(context=FakeContextService(index=index))

    ux_result = service.generate_design_section(_ctx(), section="ux_brief")
    assert sorted(ux_result["story_ids"]) == [10, 11]  # story 20 excluded — past design_locked

    runtime_result = service.generate_design_section(_ctx(), section="runtime")
    # Includes story 20 (past design_locked) AND story 12 (the fake's default
    # index has has_gherkin=False, but _all_stories_for_runtime() doesn't
    # gate on phase_status/has_gherkin flags — only on story_gherkin() content,
    # which the fake always returns non-empty for).
    assert sorted(runtime_result["story_ids"]) == [10, 11, 12, 20]


def test_generate_design_section_runtime_requires_at_least_one_story_with_gherkin():
    empty_index = {"1": {"story_id": 1, "epic_id": 7, "phase_status": "deployed", "has_gherkin": False}}
    service, _, context = _service(context=FakeContextService(index=empty_index))
    context.story_gherkin = lambda story_id: ""  # override the fake's always-truthy default

    with pytest.raises(Phase2ValidationError, match="No Phase 1 locked"):
        service.generate_design_section(_ctx(), section="runtime")


def test_generate_design_section_rejects_unknown_section():
    service, _, _ = _service()

    with pytest.raises(Phase2ValidationError, match="Unknown section"):
        service.generate_design_section(_ctx(), section="bad_section")


def test_generate_design_section_ux_brief_returns_content_and_story_ids():
    service, ai, _ = _service()

    result = service.generate_design_section(_ctx(), section="ux_brief")

    assert result["section"] == "ux_brief"
    assert "Screens" in result["content"]
    assert sorted(result["story_ids"]) == [10, 11]


def test_generate_design_section_parses_assumptions_from_content():
    class AssumptionAiService(FakeAiService):
        def generate_design_section(self, all_stories, context, section, prior_sections, instructions="") -> str:
            return (
                "## Endpoints\n### Auth\n- **EP-1** `POST /auth/login` — login (Story 10)\n\n"
                "## Assumptions\n\n- {EP-1}: assumed bearer auth since none was specified\n"
            )

    service, _, _ = _service()
    service.ai = AssumptionAiService()

    result = service.generate_design_section(_ctx(), section="endpoints")

    assert result["assumptions"] == [
        {"id": "EP-1", "text": "assumed bearer auth since none was specified"}
    ]


def test_generate_design_section_empty_assumptions_when_none_present():
    service, _, _ = _service()

    result = service.generate_design_section(_ctx(), section="ux_brief")

    assert result["assumptions"] == []


def test_generate_design_section_passes_constrained_context():
    service, ai, _ = _service()

    service.generate_design_section(_ctx(), section="ux_brief")

    _, context, section, prior = ai.section_args[0]
    assert section == "ux_brief"
    assert "locked and binding" in context or "Locked Tech Stack Constraint" in context
    assert "FastAPI + Next.js + PostgreSQL" in context


def test_generate_design_section_passes_prior_sections_as_context():
    service, ai, _ = _service()
    prior = {"ux_brief": "## Screens\n- Login", "endpoints": "## Endpoints\n- POST /auth"}

    service.generate_design_section(_ctx(), section="data_model", prior_sections=prior)

    _, _, section, received_prior = ai.section_args[0]
    assert section == "data_model"
    assert received_prior["endpoints"] == "## Endpoints\n- POST /auth"


def test_generate_design_section_stories_sorted_by_id():
    service, ai, _ = _service()

    service.generate_design_section(_ctx(), section="ux_brief")

    all_stories, _, _, _ = ai.section_args[0]
    ids = [s["story_id"] for s in all_stories]
    assert ids == sorted(ids)


def test_generate_design_section_includes_epic_titles_from_index():
    service, ai, _ = _service()

    service.generate_design_section(_ctx(), section="ux_brief")

    all_stories, _, _, _ = ai.section_args[0]
    epic_titles = {s["epic_title"] for s in all_stories}
    assert "Authentication" in epic_titles


# ---------------------------------------------------------------------------
# tech_stack_status — additional edge cases
# ---------------------------------------------------------------------------

def test_tech_stack_status_empty_string_returns_undefined():
    service, _, _ = _service(context=FakeContextService(tech_stack=""))
    assert service.tech_stack_status(_ctx()) == {"defined": False, "tech_stack": None}


def test_tech_stack_status_whitespace_only_returns_undefined():
    service, _, _ = _service(context=FakeContextService(tech_stack="   "))
    assert service.tech_stack_status(_ctx()) == {"defined": False, "tech_stack": None}


# ---------------------------------------------------------------------------
# propose_tech_stack — additional assertions
# ---------------------------------------------------------------------------

def test_propose_tech_stack_passes_tech_stack_to_ai():
    service, ai, _ = _service()
    service.propose_tech_stack(_ctx())
    _, tech_stack, _ = ai.tech_stack_args
    assert "FastAPI + Next.js + PostgreSQL" in tech_stack


def test_propose_tech_stack_excludes_pending_stories():
    service, ai, _ = _service()
    service.propose_tech_stack(_ctx())
    stories, _, _ = ai.tech_stack_args
    titles = [s["title"] for s in stories]
    assert "Pending Billing" not in titles


# ---------------------------------------------------------------------------
# lock_tech_stack — validation guard
# ---------------------------------------------------------------------------

def test_lock_tech_stack_empty_raises():
    service, _, _ = _service()
    with pytest.raises(Phase2ValidationError, match="tech_stack is required"):
        service.lock_tech_stack(_ctx(), tech_stack="   ")


# ---------------------------------------------------------------------------
# tech_stack_status — content passthrough
# ---------------------------------------------------------------------------

def test_tech_stack_status_single_line_content():
    service, _, _ = _service(context=FakeContextService(tech_stack="React + FastAPI"))
    assert service.tech_stack_status(_ctx())["tech_stack"] == "React + FastAPI"


def test_tech_stack_status_multiline_content():
    service, _, _ = _service(context=FakeContextService(tech_stack="- Next.js\n- FastAPI\n- PostgreSQL"))
    result = service.tech_stack_status(_ctx())["tech_stack"]
    assert "Next.js" in result
    assert "PostgreSQL" in result


# ---------------------------------------------------------------------------
# Design delta — additive design for post-lock stories
# ---------------------------------------------------------------------------

_LOCKED_SPEC = "# Technical Specification\n\n## Project Design\n\n**Stories:** #11\n\n### Endpoints\n\n- `GET /x`\n"


class TestDesignDelta:
    def _locked_context(self):
        context = FakeContextService()
        context.files = {"technical-spec.md": _LOCKED_SPEC}
        return context

    def test_status_unlocked_project_has_no_pending(self):
        service, _, _ = _service()  # read_context_file("technical-spec.md") == ""
        status = service.design_delta_status(_ctx())
        assert status == {"design_locked": False, "pending": []}

    def test_status_lists_only_gherkin_locked_stories(self):
        service, _, _ = _service(self._locked_context())
        status = service.design_delta_status(_ctx())
        assert status["design_locked"] is True
        # story 10 is gherkin_locked, 11 design_locked, 12 pending (no gherkin)
        assert [p["story_id"] for p in status["pending"]] == [10]
        assert status["pending"][0]["title"] == "Login"

    def test_generate_requires_locked_design(self):
        service, _, _ = _service()
        with pytest.raises(Phase2ValidationError, match="No locked project design"):
            service.generate_design_delta(_ctx())

    def test_generate_requires_pending_stories(self):
        context = self._locked_context()
        context.index["10"]["phase_status"] = "design_locked"
        service, _, _ = _service(context)
        with pytest.raises(Phase2ValidationError, match="No pending"):
            service.generate_design_delta(_ctx())

    def test_generate_passes_new_stories_and_existing_design_readonly(self):
        service, ai, _ = _service(self._locked_context())
        result = service.generate_design_delta(_ctx(), instructions="reuse auth")
        new_stories, context_str, existing_design, instructions = ai.delta_args
        assert [s["story_id"] for s in new_stories] == [10]
        assert "## Project Design" in existing_design      # locked spec injected
        assert "UX brief body" in existing_design          # UX brief injected
        assert instructions == "reuse auth"
        assert result["story_ids"] == [10]
        assert result["endpoints_delta"].startswith("- `GET /api/reports`")

    def test_generate_honours_story_subset(self):
        context = self._locked_context()
        context.index["13"] = {
            "story_id": 13, "epic_id": 7, "epic_title": "Authentication",
            "title": "Reset password", "phase_status": "gherkin_locked", "has_gherkin": True,
        }
        service, ai, _ = _service(context)
        result = service.generate_design_delta(_ctx(), story_ids=[13])
        assert [s["story_id"] for s in ai.delta_args[0]] == [13]
        assert result["story_ids"] == [13]

    def test_generate_next_ids_default_to_1_when_no_existing_ids(self):
        # _LOCKED_SPEC's "- `GET /x`" has no **EP-n**/[ENT-n]/{SCR-n} tags.
        service, ai, _ = _service(self._locked_context())
        service.generate_design_delta(_ctx())
        assert ai.delta_next_ids == {"EP": 1, "ENT": 1, "SCR": 1}

    def test_generate_next_ids_continue_past_existing_max(self):
        context = self._locked_context()
        context.files["technical-spec.md"] = (
            "# Technical Specification\n\n## Project Design\n\n**Stories:** #11\n\n"
            "### Endpoints\n\n"
            "- **EP-1** `GET /x` — x (Story 11) · auth:none · out:x:str\n"
            "- **EP-3** `GET /y` — y (Story 11) · auth:none · out:y:str\n\n"
            "### Data Model\n\n"
            "### User [ENT-2]\n- Fields: `id: str`\n"
        )
        service, ai, _ = _service(context)
        service.generate_design_delta(_ctx())
        assert ai.delta_next_ids == {"EP": 4, "ENT": 3, "SCR": 1}

    def test_persist_requires_nonempty_delta(self):
        service, _, _ = _service(self._locked_context())
        with pytest.raises(Phase2ValidationError, match="empty delta"):
            service.persist_design_delta(
                _ctx(), story_ids=[10], ux_brief_addendum=" ", endpoints_delta="", data_model_delta="",
            )

    def test_persist_empty_delta_with_note_allowed(self):
        # Real gap: infra/tooling stories (e.g. "add a local Docker dev
        # environment") genuinely need no new UI, endpoints, or data model —
        # they were permanently stuck at gherkin_locked with no way to ever
        # reach design_locked, so they never appeared in Phase 3's eligible
        # list. A note explaining "no design changes needed" now unblocks it.
        context = self._locked_context()
        service, _, _ = _service(context)
        result = service.persist_design_delta(
            _ctx(), story_ids=[10], ux_brief_addendum="", endpoints_delta="", data_model_delta="",
            note="Pure infra/tooling — no new UI, endpoints, or data model needed.",
        )
        assert context.appended_delta[0] == [10]
        assert context.appended_delta[1:] == ("", "", "")
        assert result["story_ids"] == [10]

    def test_persist_empty_delta_without_note_still_rejected(self):
        # Whitespace-only note must not silently bypass the guard either.
        service, _, _ = _service(self._locked_context())
        with pytest.raises(Phase2ValidationError, match="empty delta"):
            service.persist_design_delta(
                _ctx(), story_ids=[10], ux_brief_addendum="", endpoints_delta="", data_model_delta="", note="   ",
            )

    def test_persist_pure_additive_appends_without_amendment(self):
        context = self._locked_context()
        context.affected = [10, 11]
        service, _, _ = _service(context)
        result = service.persist_design_delta(
            _ctx(), story_ids=[10], ux_brief_addendum="", endpoints_delta="- `GET /r`", data_model_delta="",
        )
        assert context.appended_delta[0] == [10]
        assert not getattr(context, "amendments", [])
        assert result["amended"] is False
        assert result["versions"] == {"technical-spec.md": "1.1.0"}

    def test_persist_touching_delta_records_amendment_on_old_stories_only(self):
        context = self._locked_context()
        context.affected = [10, 11]  # includes the delta's own story 10
        service, _, _ = _service(context)
        result = service.persist_design_delta(
            _ctx(), story_ids=[10], ux_brief_addendum="", endpoints_delta="- `GET /r`",
            data_model_delta="", touches_existing=["GET /x — response shape changes"], note="reviewed",
        )
        assert result["amended"] is True
        assert result["affected_story_ids"] == [11]  # 10 excluded: it IS the delta
        filename, note, story_ids = context.amendments[0]
        assert filename == "technical-spec.md"
        assert "GET /x — response shape changes" in note and "reviewed" in note
        assert story_ids == [11]

    def test_persist_design_over_locked_design_records_amendment(self):
        # Closes the bypass: a full re-persist over a locked design used to
        # silently replace the contract with no amendment/version/drift.
        context = self._locked_context()
        context.affected = [11]
        service, _, _ = _service(context)
        service.persist_design(
            _ctx(), story_ids=[10, 11], ux_brief="ux", endpoints="e", data_model="d",
            runtime_spec="## Runtime Contract\n- **app root** {RT-1}: frontend/app",
        )
        files = sorted(a[0] for a in context.amendments)
        assert files == ["design-bundle.md", "technical-spec.md"]
        assert all(a[2] == [11] for a in context.amendments)

    def test_persist_design_first_lock_records_no_amendment(self):
        context = FakeContextService()  # nothing locked yet
        service, _, _ = _service(context)
        service.persist_design(
            _ctx(), story_ids=[10], ux_brief="ux", endpoints="e", data_model="d",
            runtime_spec="## Runtime Contract\n- **app root** {RT-1}: frontend/app",
        )
        assert not getattr(context, "amendments", [])

    def test_persist_design_requires_runtime_spec(self):
        service, _, _ = _service(FakeContextService())
        with pytest.raises(Phase2ValidationError, match="Runtime Contract is required"):
            service.persist_design(
                _ctx(), story_ids=[10], ux_brief="ux", endpoints="e", data_model="d", runtime_spec="",
            )

    def test_persist_design_runtime_spec_covers_all_stories_not_just_story_ids(self):
        # story_ids (narrower — the set still eligible for a fresh design lock)
        # must not limit which stories get has_runtime_spec: the contract is
        # project-wide infra, so every indexed story with Gherkin gets it,
        # independent of what this particular lock call covers.
        context = FakeContextService()  # index has stories 10, 11, 12
        service, _, _ = _service(context)
        service.persist_design(
            _ctx(), story_ids=[10], ux_brief="ux", endpoints="e", data_model="d",
            runtime_spec="## Runtime Contract\n- **app root** {RT-1}: frontend/app",
        )
        written_ids, written_spec = context.written_runtime_spec
        assert sorted(written_ids) == [10, 11, 12]
        assert "app root" in written_spec

    def test_persist_design_runtime_spec_relocks_independently_of_technical_spec(self):
        # runtime-spec.md can lock/relock on its own schedule (added long after
        # the core design already locked) — its amendment detection must not
        # piggyback on technical-spec.md's own lock marker.
        context = FakeContextService()
        context.files = {"runtime-spec.md": "already locked content"}  # technical-spec.md NOT locked yet
        context.affected = [10, 11]  # what affected_stories_for_spec("runtime-spec.md") returns
        service, _, _ = _service(context)
        service.persist_design(
            _ctx(), story_ids=[10], ux_brief="ux", endpoints="e", data_model="d",
            runtime_spec="## Runtime Contract\n- **app root** {RT-1}: frontend/app",
        )
        files = [a[0] for a in context.amendments]
        assert files == ["runtime-spec.md"]  # technical-spec.md/design-bundle.md: first lock, no amendment
        assert context.amendments[0][2] == [10, 11]


class TestDesignSystem:
    def test_generate_design_system_persists_and_returns(self):
        service, ai, context = _service()
        result = service.generate_design_system(_ctx(), ux_brief_md="## Login screen")
        assert ai.design_system_args == "## Login screen"
        assert result["colors"][0]["name"] == "primary"
        assert result["screens"][0]["id"] == "dashboard"
        assert context.saved_design_system == result

    def test_load_design_system_delegates_to_context(self):
        service, _, context = _service()
        assert service.load_design_system(_ctx()) is None
        service.generate_design_system(_ctx(), ux_brief_md="## Login screen")
        assert service.load_design_system(_ctx())["colors"][0]["name"] == "primary"

    def test_generate_design_system_threads_instructions(self):
        service, ai, _ = _service()
        service.generate_design_system(_ctx(), ux_brief_md="## Login screen", instructions="Dark palette")
        assert ai.design_system_instructions == "Dark palette"

    def test_save_design_system_persists_verbatim_no_ai(self):
        service, ai, context = _service()
        edited = {"colors": [{"name": "primary", "hex": "#000000", "usage": "edited by hand"}]}
        result = service.save_design_system(_ctx(), design_system=edited)
        assert result == edited
        assert context.saved_design_system == edited
        assert not hasattr(ai, "design_system_args")  # no AI call made


class TestGenerateDesignSystemScreen:
    def _seeded_context(self):
        context = FakeContextService()
        context.saved_design_system = {
            "colors": [], "typography": {}, "navigation": {},
            "screens": [
                {"id": "dashboard", "label": "Dashboard", "archetype": "dashboard", "blocks": []},
                {"id": "detail", "label": "Detail", "archetype": "detail", "blocks": []},
            ],
            "component_states": [],
        }
        return context

    def test_requires_existing_design_system(self):
        service, _, _ = _service()
        with pytest.raises(Phase2ValidationError, match="Generate the full design system first"):
            service.generate_design_system_screen(_ctx(), ux_brief_md="## Brief", screen_id="dashboard")

    def test_regenerate_replaces_screen_in_place_keeps_id(self):
        context = self._seeded_context()
        service, ai, _ = _service(context)
        result = service.generate_design_system_screen(_ctx(), ux_brief_md="## Brief", screen_id="dashboard")
        ids = [s["id"] for s in result["screens"]]
        assert ids == ["dashboard", "detail"]  # position + id preserved
        assert result["screens"][0]["label"] == "Regenerated"  # new content
        assert ai.screen_args["screen_id"] == "dashboard"
        # Phase2Service passes the full list through; ai_engine.extract_design_system_screen
        # is the layer that filters out the target screen itself (tested separately).
        assert len(ai.screen_args["existing_screens"]) == 2

    def test_add_new_screen_appends(self):
        context = self._seeded_context()
        service, ai, _ = _service(context)
        result = service.generate_design_system_screen(_ctx(), ux_brief_md="## Brief", screen_id=None)
        ids = [s["id"] for s in result["screens"]]
        assert ids == ["dashboard", "detail", "ai-picked-id"]
        assert ai.screen_args["screen_id"] is None
        assert len(ai.screen_args["existing_screens"]) == 2  # both existing screens as context

    def test_add_new_screen_dedupes_colliding_id(self):
        context = self._seeded_context()
        service, ai, _ = _service(context)
        ai.screen_result = DesignSystemScreen(
            id="dashboard", label="Another Dashboard", archetype="dashboard", blocks=[],
        )
        result = service.generate_design_system_screen(_ctx(), ux_brief_md="## Brief", screen_id=None)
        ids = [s["id"] for s in result["screens"]]
        assert ids == ["dashboard", "detail", "dashboard_2"]

    def test_regenerate_appends_when_screen_id_not_found(self):
        context = self._seeded_context()
        service, ai, _ = _service(context)
        result = service.generate_design_system_screen(_ctx(), ux_brief_md="## Brief", screen_id="nonexistent")
        ids = [s["id"] for s in result["screens"]]
        assert ids == ["dashboard", "detail", "nonexistent"]

    def test_threads_instructions(self):
        context = self._seeded_context()
        service, ai, _ = _service(context)
        service.generate_design_system_screen(
            _ctx(), ux_brief_md="## Brief", screen_id="dashboard", instructions="More whitespace",
        )
        assert ai.screen_args["instructions"] == "More whitespace"

    def test_saves_spliced_result(self):
        context = self._seeded_context()
        service, _, _ = _service(context)
        result = service.generate_design_system_screen(_ctx(), ux_brief_md="## Brief", screen_id="dashboard")
        assert context.saved_design_system == result
