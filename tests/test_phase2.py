"""Unit tests for Phase 2 state logic."""

import asyncio
from unittest.mock import MagicMock, patch

from state.phase2 import Phase2State


def _bare_state(cls, **attrs):
    state = object.__new__(cls)
    object.__setattr__(state, "dirty_vars", set())
    for k, v in attrs.items():
        object.__setattr__(state, k, v)
    return state


def _run_async_event(coro_or_gen):
    async def _drain():
        result = coro_or_gen
        if hasattr(result, "__aiter__"):
            async for _ in result:
                pass
        else:
            await result
    asyncio.run(_drain())


_MEMORY_BANK_WITH_STACK = """\
# Memory Bank

## Project Concept

Test project.

## Tech Stack

FastAPI + React + PostgreSQL

## Architecture Principles

Keep it simple.
"""

_MEMORY_BANK_EMPTY_STACK = """\
# Memory Bank

## Tech Stack

<!-- Fill in tech stack here -->

## Architecture Principles

Keep it simple.
"""


# ---------------------------------------------------------------------------
# Stage A — Tech Stack
# ---------------------------------------------------------------------------

def test_load_page_sets_gate0_if_stack_exists():
    state = _bare_state(
        Phase2State,
        existing_tech_stack="",
        gate0_approved=False,
        epic_list=[],
        epics_loading=False,
        epics_load_error="",
        active_project_id=1,
        auth_token="tok",
    )
    with patch("state.phase2.context_manager") as mock_cm, \
         patch("state.phase2.taiga_adapter") as mock_ta:
        mock_cm.read_context_file.return_value = _MEMORY_BANK_WITH_STACK
        mock_cm.get_story_index.return_value = {}
        mock_ta.get_epics.return_value = []
        Phase2State.load_page_data.fn(state)

    assert state.gate0_approved is True
    assert "FastAPI" in state.existing_tech_stack


def test_load_page_leaves_gate0_false_if_stack_empty():
    state = _bare_state(
        Phase2State,
        existing_tech_stack="",
        gate0_approved=False,
        epic_list=[],
        epics_loading=False,
        epics_load_error="",
        active_project_id=1,
        auth_token="tok",
    )
    with patch("state.phase2.context_manager") as mock_cm, \
         patch("state.phase2.taiga_adapter") as mock_ta:
        mock_cm.read_context_file.return_value = _MEMORY_BANK_EMPTY_STACK
        mock_cm.get_story_index.return_value = {}
        mock_ta.get_epics.return_value = []
        Phase2State.load_page_data.fn(state)

    assert state.gate0_approved is False
    assert state.existing_tech_stack == ""


def test_load_epics_groups_by_epic():
    state = _bare_state(
        Phase2State,
        epic_list=[],
        epics_loading=False,
        epics_load_error="",
        active_project_id=42,
        auth_token="tok",
    )
    index = {
        "1": {"story_id": 1, "epic_id": 10, "title": "S1", "phase_status": "gherkin_locked"},
        "2": {"story_id": 2, "epic_id": 10, "title": "S2", "phase_status": "gherkin_locked"},
        "3": {"story_id": 3, "epic_id": 20, "title": "S3", "phase_status": "design_locked"},
    }
    with patch("state.phase2.context_manager") as mock_cm, \
         patch("state.phase2.taiga_adapter") as mock_ta:
        mock_ta.get_epics.return_value = [
            {"id": 10, "subject": "Epic Alpha"},
            {"id": 20, "subject": "Epic Beta"},
        ]
        mock_cm.get_story_index.return_value = index
        Phase2State.load_epics.fn(state)

    assert len(state.epic_list) == 2
    epic_alpha = next(e for e in state.epic_list if e["epic_id"] == 10)
    assert epic_alpha["story_count"] == 2
    assert epic_alpha["all_locked"] is False

    epic_beta = next(e for e in state.epic_list if e["epic_id"] == 20)
    assert epic_beta["all_locked"] is True


def test_suggest_stack_returns_five_alternatives():
    state = _bare_state(
        Phase2State,
        stack_suggesting=False,
        stack_error="",
        stack_alternatives=[],
        auth_token="tok",
        active_project_id=1,
    )
    mock_alternatives = [
        {"name": "Option A", "description": "Simple.", "trade_offs": "+ fast"},
        {"name": "Option B", "description": "Mid.", "trade_offs": "+ balanced"},
        {"name": "Option C", "description": "Scale.", "trade_offs": "+ scalable"},
        {"name": "Option D", "description": "Enterprise.", "trade_offs": "+ robust"},
        {"name": "Option E", "description": "Serverless.", "trade_offs": "+ elastic"},
    ]
    with patch("state.phase2.context_manager") as mock_cm, \
         patch("state.phase2.ai_engine") as mock_ai:
        mock_cm.get_story_index.return_value = {
            "1": {"story_id": 1, "epic_id": 5, "title": "S1",
                  "phase_status": "gherkin_locked", "epic_title": "Ep1"},
        }
        mock_cm.get_story_gherkin.return_value = "Feature: S1\n  Scenario: x\n"
        mock_cm.read_context_file.return_value = "Memory bank content"
        mock_ai.suggest_tech_stack.return_value = mock_alternatives

        coro = Phase2State.run_suggest_stack.fn(state)
        _run_async_event(coro)

    assert len(state.stack_alternatives) == 5
    assert state.stack_alternatives[0]["name"] == "Option A"
    assert state.stack_suggesting is False


def test_select_alternative_prefills_edit():
    alternatives = [
        {"name": "FastAPI", "description": "Great for APIs.", "trade_offs": "+ simple"},
        {"name": "Django", "description": "Full stack.", "trade_offs": "+ batteries"},
        {"name": "Rails", "description": "Fast dev.", "trade_offs": "+ convention"},
    ]
    state = _bare_state(
        Phase2State,
        stack_alternatives=alternatives,
        selected_alternative_index=-1,
        tech_stack_edit="",
    )
    with patch("state.phase2.context_manager"):
        Phase2State.select_alternative.fn(state, 1)

    assert state.selected_alternative_index == 1
    assert "Django" in state.tech_stack_edit
    assert "Full stack." in state.tech_stack_edit


def test_approve_gate0_writes_tech_stack():
    state = _bare_state(
        Phase2State,
        tech_stack_edit="FastAPI + React",
        existing_tech_stack="",
        gate0_approved=False,
    )
    with patch("state.phase2.context_manager") as mock_cm:
        mock_cm.write_tech_stack = MagicMock()
        mock_cm.save_design_draft = MagicMock()
        Phase2State.approve_gate0.fn(state)

    mock_cm.write_tech_stack.assert_called_once_with("FastAPI + React")
    assert state.gate0_approved is True
    assert state.existing_tech_stack == "FastAPI + React"


# ---------------------------------------------------------------------------
# Stage B — Epic selection
# ---------------------------------------------------------------------------

def test_select_epic_loads_all_gherkin():
    state = _bare_state(
        Phase2State,
        epic_list=[{"epic_id": 7, "epic_title": "Epic Seven", "story_count": 2, "all_locked": False}],
        selected_epic_id=0,
        selected_epic_title="",
        stories_in_epic=[],
        gate1_approved=False,
        gate2_approved=False,
        wireframes_draft="", wireframes_edit="",
        user_flow_draft="", user_flow_edit="",
        component_tree_draft="", component_tree_edit="",
        tech_spec_draft="", tech_spec_edit="",
        generate_error="", save_error="", generation_log=[],
    )
    index = {
        "10": {"story_id": 10, "epic_id": 7, "title": "Login", "phase_status": "gherkin_locked"},
        "11": {"story_id": 11, "epic_id": 7, "title": "Logout", "phase_status": "gherkin_locked"},
    }
    with patch("state.phase2.context_manager") as mock_cm:
        mock_cm.get_story_index.return_value = index
        mock_cm.get_story_gherkin.side_effect = lambda sid: f"Feature: Story {sid}\n"
        mock_cm.save_design_draft = MagicMock()
        list(Phase2State.select_epic.fn(state, "7"))

    assert state.selected_epic_id == 7
    assert state.selected_epic_title == "Epic Seven"
    assert len(state.stories_in_epic) == 2
    assert mock_cm.get_story_gherkin.call_count == 2


def test_select_epic_resets_gate1_gate2():
    state = _bare_state(
        Phase2State,
        epic_list=[{"epic_id": 5, "epic_title": "E5", "story_count": 1, "all_locked": False}],
        selected_epic_id=5,
        selected_epic_title="E5",
        stories_in_epic=[],
        gate1_approved=True,
        gate2_approved=True,
        wireframes_edit="old wireframes",
        user_flow_edit="old flow",
        component_tree_edit="old tree",
        tech_spec_edit="old spec",
        wireframes_draft="", user_flow_draft="",
        component_tree_draft="", tech_spec_draft="",
        generate_error="", save_error="", generation_log=[],
    )
    index = {"99": {"story_id": 99, "epic_id": 5, "title": "S", "phase_status": "gherkin_locked"}}
    with patch("state.phase2.context_manager") as mock_cm:
        mock_cm.get_story_index.return_value = index
        mock_cm.get_story_gherkin.return_value = "Feature: S\n"
        mock_cm.save_design_draft = MagicMock()
        list(Phase2State.select_epic.fn(state, "5"))

    assert state.gate1_approved is False
    assert state.gate2_approved is False
    assert state.wireframes_edit == ""
    assert state.tech_spec_edit == ""


def test_select_epic_does_not_reset_gate0():
    state = _bare_state(
        Phase2State,
        epic_list=[{"epic_id": 3, "epic_title": "E3", "story_count": 1, "all_locked": False}],
        selected_epic_id=0, selected_epic_title="",
        stories_in_epic=[],
        gate0_approved=True,
        existing_tech_stack="FastAPI",
        gate1_approved=True, gate2_approved=True,
        wireframes_draft="", wireframes_edit="",
        user_flow_draft="", user_flow_edit="",
        component_tree_draft="", component_tree_edit="",
        tech_spec_draft="", tech_spec_edit="",
        generate_error="", save_error="", generation_log=[],
    )
    index = {"5": {"story_id": 5, "epic_id": 3, "title": "S", "phase_status": "gherkin_locked"}}
    with patch("state.phase2.context_manager") as mock_cm:
        mock_cm.get_story_index.return_value = index
        mock_cm.get_story_gherkin.return_value = ""
        mock_cm.save_design_draft = MagicMock()
        list(Phase2State.select_epic.fn(state, "3"))

    assert state.gate0_approved is True
    assert state.existing_tech_stack == "FastAPI"


# ---------------------------------------------------------------------------
# can_generate computed var
# ---------------------------------------------------------------------------

def test_can_generate_blocked_without_tech_stack():
    state = _bare_state(
        Phase2State,
        existing_tech_stack="",
        gate0_approved=False,
        is_authenticated=True,
        has_project=True,
        selected_epic_id=5,
        stories_in_epic=[{"story_id": 1, "title": "S", "gherkin": "Feature: S", "phase_status": "gherkin_locked"}],
        generating=False,
    )
    assert Phase2State.tech_stack_confirmed.fget(state) is False
    assert Phase2State.can_generate.fget(state) is False


# ---------------------------------------------------------------------------
# Stage B — Generation
# ---------------------------------------------------------------------------

def test_run_generate_sets_all_four_outputs():
    state = _bare_state(
        Phase2State,
        generating=False,
        generate_error="",
        generation_log=[],
        selected_epic_title="Payments",
        stories_in_epic=[{"story_id": 1, "title": "Pay", "gherkin": "Feature: Pay\n"}],
        wireframes_draft="", wireframes_edit="",
        user_flow_draft="", user_flow_edit="",
        component_tree_draft="", component_tree_edit="",
        tech_spec_draft="", tech_spec_edit="",
    )
    design_result = {
        "wireframes": "+---------+\n| Screen  |\n+---------+",
        "user_flow": "flowchart TD\n    A[Start] --> B[Pay]",
        "component_tree": "App\n  PaymentForm\n    Submit",
        "tech_spec": "openapi: '3.0'\npaths:\n  /pay: {}",
    }
    with patch("state.phase2.context_manager") as mock_cm, \
         patch("state.phase2.ai_engine") as mock_ai:
        mock_cm.read_context_file.return_value = "Memory Bank"
        mock_cm.save_design_draft = MagicMock()
        mock_ai.generate_phase2_design.return_value = design_result

        coro = Phase2State.run_generate.fn(state)
        _run_async_event(coro)

    assert state.wireframes_edit == design_result["wireframes"]
    assert state.user_flow_edit == design_result["user_flow"]
    assert state.component_tree_edit == design_result["component_tree"]
    assert state.tech_spec_edit == design_result["tech_spec"]
    assert state.generating is False


# ---------------------------------------------------------------------------
# Gate approvals
# ---------------------------------------------------------------------------

def test_approve_gate1():
    state = _bare_state(Phase2State, gate1_approved=False, wireframes_edit="Some wireframes")
    with patch("state.phase2.context_manager"):
        Phase2State.approve_gate1.fn(state)
    assert state.gate1_approved is True


def test_approve_gate2_blocked_without_gate1():
    state = _bare_state(Phase2State, gate1_approved=False, gate2_approved=False,
                        tech_spec_edit="spec content")
    with patch("state.phase2.context_manager"):
        Phase2State.approve_gate2.fn(state)
    assert state.gate2_approved is False


def test_approve_gate2_after_gate1():
    state = _bare_state(Phase2State, gate1_approved=True, gate2_approved=False,
                        tech_spec_edit="spec content", saving=False)
    with patch("state.phase2.context_manager"):
        Phase2State.approve_gate2.fn(state)
    assert state.gate2_approved is True
    assert Phase2State.can_save.fget(state) is True


# ---------------------------------------------------------------------------
# save_design
# ---------------------------------------------------------------------------

def test_save_design_calls_append_epic_spec():
    state = _bare_state(
        Phase2State,
        selected_epic_id=7,
        selected_epic_title="My Epic",
        stories_in_epic=[
            {"story_id": 10, "title": "S1", "gherkin": "", "phase_status": "gherkin_locked"},
            {"story_id": 11, "title": "S2", "gherkin": "", "phase_status": "gherkin_locked"},
        ],
        tech_spec_edit="openapi: '3.0'",
        wireframes_edit="wireframe text",
        saving=False,
        save_error="",
    )
    with patch("state.phase2.context_manager") as mock_cm:
        mock_cm.append_epic_technical_spec = MagicMock()
        mock_cm.append_memory_bank_design = MagicMock()
        mock_cm.clear_design_draft = MagicMock()
        gen = Phase2State.save_design.fn(state)
        _run_async_event(gen)

    mock_cm.append_epic_technical_spec.assert_called_once_with(
        7, "My Epic", [10, 11], "openapi: '3.0'"
    )


def test_save_design_writes_memory_bank():
    state = _bare_state(
        Phase2State,
        selected_epic_id=3,
        selected_epic_title="Auth Epic",
        stories_in_epic=[{"story_id": 5, "title": "Login", "gherkin": "", "phase_status": "gherkin_locked"}],
        tech_spec_edit="spec",
        wireframes_edit="wireframes",
        saving=False,
        save_error="",
    )
    with patch("state.phase2.context_manager") as mock_cm:
        mock_cm.append_epic_technical_spec = MagicMock()
        mock_cm.append_memory_bank_design = MagicMock()
        mock_cm.clear_design_draft = MagicMock()
        gen = Phase2State.save_design.fn(state)
        _run_async_event(gen)

    mock_cm.append_memory_bank_design.assert_called_once_with(
        3, "Auth Epic", prototype_summary="wireframes", tech_spec_summary="spec"
    )


def test_save_design_clears_draft():
    state = _bare_state(
        Phase2State,
        selected_epic_id=1,
        selected_epic_title="E",
        stories_in_epic=[{"story_id": 2, "title": "S", "gherkin": "", "phase_status": "gherkin_locked"}],
        tech_spec_edit="spec",
        wireframes_edit="w",
        saving=False,
        save_error="",
    )
    with patch("state.phase2.context_manager") as mock_cm:
        mock_cm.append_epic_technical_spec = MagicMock()
        mock_cm.append_memory_bank_design = MagicMock()
        mock_cm.clear_design_draft = MagicMock()
        gen = Phase2State.save_design.fn(state)
        _run_async_event(gen)

    mock_cm.clear_design_draft.assert_called_once()


# ---------------------------------------------------------------------------
# reset_story
# ---------------------------------------------------------------------------

def test_reset_preserves_gate0_and_selection():
    state = _bare_state(
        Phase2State,
        gate0_approved=True,
        existing_tech_stack="FastAPI",
        selected_epic_id=9,
        epic_list=[{"epic_id": 9}],
        stories_in_epic=[{"story_id": 1, "title": "S", "gherkin": "", "phase_status": "gherkin_locked"}],
        gate1_approved=True,
        gate2_approved=True,
        wireframes_edit="wf",
        tech_spec_edit="spec",
        user_flow_edit="flow",
        component_tree_edit="tree",
        wireframes_draft="", user_flow_draft="",
        component_tree_draft="", tech_spec_draft="",
        generate_error="err", save_error="err2", generation_log=["x"],
    )
    with patch("state.phase2.context_manager") as mock_cm:
        mock_cm.clear_design_draft = MagicMock()
        list(Phase2State.reset_story.fn(state))

    assert state.gate0_approved is True
    assert state.existing_tech_stack == "FastAPI"
    assert state.selected_epic_id == 9
    assert state.gate1_approved is False
    assert state.gate2_approved is False
    assert state.wireframes_edit == ""
    assert state.tech_spec_edit == ""


# ---------------------------------------------------------------------------
# restore_draft
# ---------------------------------------------------------------------------

def test_restore_draft_hydrates_all_fields():
    state = _bare_state(
        Phase2State,
        draft_restored=False,
        existing_tech_stack="",
        stack_alternatives=[],
        selected_alternative_index=-1,
        tech_stack_edit="",
        gate0_approved=False,
        selected_epic_id=0,
        selected_epic_title="",
        stories_in_epic=[],
        wireframes_edit="",
        user_flow_edit="",
        component_tree_edit="",
        tech_spec_edit="",
        gate1_approved=False,
        gate2_approved=False,
    )
    draft = {
        "existing_tech_stack": "FastAPI",
        "stack_alternatives": [{"name": "A"}],
        "selected_alternative_index": 0,
        "tech_stack_edit": "FastAPI stack",
        "gate0_approved": True,
        "selected_epic_id": 7,
        "selected_epic_title": "Payments",
        "stories_in_epic": [{"story_id": 1, "title": "Pay", "gherkin": "", "phase_status": "gherkin_locked"}],
        "wireframes_edit": "wf content",
        "user_flow_edit": "flowchart TD\n  A-->B",
        "component_tree_edit": "App\n  Form",
        "tech_spec_edit": "openapi: '3.0'",
        "gate1_approved": True,
        "gate2_approved": False,
    }
    with patch("state.phase2.context_manager") as mock_cm:
        mock_cm.load_design_draft.return_value = draft
        list(Phase2State.restore_draft.fn(state))

    assert state.existing_tech_stack == "FastAPI"
    assert state.gate0_approved is True
    assert state.selected_epic_id == 7
    assert state.wireframes_edit == "wf content"
    assert state.gate1_approved is True
    assert state.gate2_approved is False
    assert state.draft_restored is True


def test_restore_draft_guard():
    state = _bare_state(
        Phase2State,
        draft_restored=True,
        existing_tech_stack="",
    )
    with patch("state.phase2.context_manager") as mock_cm:
        mock_cm.load_design_draft = MagicMock()
        list(Phase2State.restore_draft.fn(state))

    mock_cm.load_design_draft.assert_not_called()


# ---------------------------------------------------------------------------
# design_complete computed var
# ---------------------------------------------------------------------------

def test_design_complete_var():
    state_complete = _bare_state(
        Phase2State,
        stories_in_epic=[
            {"story_id": 1, "phase_status": "design_locked"},
            {"story_id": 2, "phase_status": "design_locked"},
        ],
    )
    assert Phase2State.design_complete.fget(state_complete) is True

    state_partial = _bare_state(
        Phase2State,
        stories_in_epic=[
            {"story_id": 1, "phase_status": "design_locked"},
            {"story_id": 2, "phase_status": "gherkin_locked"},
        ],
    )
    assert Phase2State.design_complete.fget(state_partial) is False

    state_empty = _bare_state(Phase2State, stories_in_epic=[])
    assert Phase2State.design_complete.fget(state_empty) is False
