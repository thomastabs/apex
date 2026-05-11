"""Unit tests for Phase 1 state logic — pure functions and state mutations."""

from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_valid_compiled(n: int = 1) -> list[dict]:
    return [
        {
            "title":   f"Story {i + 1}",
            "size":    "S",
            "gherkin": (
                f"Feature: Story {i + 1}\n\n"
                f"  Scenario: Happy path\n"
                f"    Given the system is ready\n"
                f"    When the user acts\n"
                f"    Then the outcome is correct\n"
            ),
        }
        for i in range(n)
    ]


def _gherkin_edits(compiled: list[dict]) -> list[str]:
    return [item["gherkin"] for item in compiled]


def _bare_state(cls, **attrs):
    """Create a bare Reflex state instance for unit testing without the Reflex runtime.

    Reflex's __setattr__ requires dirty_vars to be a set; __new__ alone leaves it None.
    Seeding it here lets event-handler attribute assignments work without a running app.
    """
    state = object.__new__(cls)
    object.__setattr__(state, "dirty_vars", set())
    for k, v in attrs.items():
        object.__setattr__(state, k, v)
    return state


# ---------------------------------------------------------------------------
# validate_stories (pure function — no Reflex state needed)
# ---------------------------------------------------------------------------

class TestValidateStories:
    def _validate(self, compiled, edits=None):
        from state.phase1 import validate_stories
        if edits is None:
            edits = _gherkin_edits(compiled)
        return validate_stories(compiled, edits)

    def test_valid_single_story_returns_no_errors(self):
        assert self._validate(_make_valid_compiled(1)) == []

    def test_valid_multiple_stories_return_no_errors(self):
        assert self._validate(_make_valid_compiled(3)) == []

    def test_missing_title_reports_error(self):
        compiled = _make_valid_compiled(1)
        compiled[0]["title"] = ""
        errors = self._validate(compiled)
        assert any("no title" in e for e in errors)

    def test_missing_feature_header_reports_error(self):
        compiled = _make_valid_compiled(1)
        bad_gherkin = "  Scenario: s\n    Given x\n    When y\n    Then z\n"
        errors = self._validate(compiled, [bad_gherkin])
        assert any("Feature" in e for e in errors)

    def test_missing_scenario_block_reports_error(self):
        compiled = _make_valid_compiled(1)
        errors = self._validate(compiled, ["Feature: X\n"])
        assert any("Scenario" in e for e in errors)

    def test_edits_override_item_gherkin(self):
        compiled = _make_valid_compiled(1)
        compiled[0]["gherkin"] = "Feature: X\n"
        valid = "Feature: Valid\n\n  Scenario: s\n    Given x\n    When y\n    Then z\n"
        assert self._validate(compiled, [valid]) == []

    def test_falls_back_to_item_gherkin_when_edit_empty(self):
        # Empty string edit → fall back to the item's compiled gherkin.
        compiled = _make_valid_compiled(1)
        assert self._validate(compiled, [""]) == []

    def test_scenario_outline_counts_as_valid(self):
        compiled = _make_valid_compiled(1)
        outline = (
            "Feature: X\n\n"
            "  Scenario Outline: parameterised\n"
            "    Given <input>\n    When action\n    Then <output>\n"
        )
        assert self._validate(compiled, [outline]) == []

    def test_two_stories_first_invalid_second_valid(self):
        compiled = _make_valid_compiled(2)
        edits = ["Feature: X\n", compiled[1]["gherkin"]]
        errors = self._validate(compiled, edits)
        assert len(errors) == 1

    def test_error_label_uses_title(self):
        compiled = _make_valid_compiled(1)
        errors = self._validate(compiled, ["Feature: X\n"])
        assert any("Story 1" in e for e in errors)

    def test_error_label_positional_when_no_title(self):
        compiled = _make_valid_compiled(1)
        compiled[0]["title"] = ""
        errors = self._validate(compiled, ["Feature: X\n"])
        assert any("Story 1" in e for e in errors)


# ---------------------------------------------------------------------------
# Phase1State — add_story / delete_story
# ---------------------------------------------------------------------------

class TestAddAndDeleteStory:
    def _make_state(self, compiled: list[dict]):
        from state.phase1 import Phase1State
        return _bare_state(
            Phase1State,
            compiled_stories=list(compiled),
            gherkin_edits=_gherkin_edits(compiled),
            epic_subject_input="",
            epic_id_input="",
            nl_draft="",
            nl_editor="",
        )

    def test_add_story_increases_list_length(self):
        from state.phase1 import Phase1State
        state = self._make_state(_make_valid_compiled(2))
        Phase1State.add_story.fn(state)
        assert len(state.compiled_stories) == 3

    def test_add_story_has_default_title(self):
        from state.phase1 import Phase1State
        state = self._make_state(_make_valid_compiled(1))
        Phase1State.add_story.fn(state)
        assert state.compiled_stories[-1]["title"] == "New Story"

    def test_add_story_has_feature_header(self):
        from state.phase1 import Phase1State
        state = self._make_state(_make_valid_compiled(1))
        Phase1State.add_story.fn(state)
        assert "Feature:" in state.compiled_stories[-1]["gherkin"]

    def test_delete_story_decreases_list_length(self):
        from state.phase1 import Phase1State
        state = self._make_state(_make_valid_compiled(3))
        with patch("state.phase1.context_manager"):
            Phase1State.delete_story.fn(state, 1)
        assert len(state.compiled_stories) == 2

    def test_delete_correct_story(self):
        from state.phase1 import Phase1State
        state = self._make_state(_make_valid_compiled(3))
        title_to_delete = state.compiled_stories[1]["title"]
        with patch("state.phase1.context_manager"):
            Phase1State.delete_story.fn(state, 1)
        titles = [s["title"] for s in state.compiled_stories]
        assert title_to_delete not in titles

    def test_delete_first_story(self):
        from state.phase1 import Phase1State
        state = self._make_state(_make_valid_compiled(2))
        second_title = state.compiled_stories[1]["title"]
        with patch("state.phase1.context_manager"):
            Phase1State.delete_story.fn(state, 0)
        assert state.compiled_stories[0]["title"] == second_title

    def test_gherkin_edits_kept_in_sync_after_delete(self):
        from state.phase1 import Phase1State
        state = self._make_state(_make_valid_compiled(3))
        with patch("state.phase1.context_manager"):
            Phase1State.delete_story.fn(state, 0)
        assert len(state.gherkin_edits) == len(state.compiled_stories)


# ---------------------------------------------------------------------------
# Phase1State — set_nl_editor saves draft
# ---------------------------------------------------------------------------

class TestSetNlEditor:
    def _make_state(self):
        from state.phase1 import Phase1State
        return _bare_state(
            Phase1State,
            nl_editor="",
            nl_draft="",
            compiled_stories=[],
            gherkin_edits=[],
            epic_subject_input="",
            epic_id_input="",
        )

    def test_set_nl_editor_updates_var(self):
        from state.phase1 import Phase1State
        state = self._make_state()
        with patch("state.phase1.context_manager"):
            Phase1State.set_nl_editor.fn(state, "new content")
        assert state.nl_editor == "new content"

    def test_set_nl_editor_calls_save_draft(self):
        from state.phase1 import Phase1State
        state = self._make_state()
        with patch("state.phase1.context_manager") as mock_cm:
            mock_cm.save_draft = MagicMock()
            Phase1State.set_nl_editor.fn(state, "hello")
            mock_cm.save_draft.assert_called_once()


# ---------------------------------------------------------------------------
# Phase1State — restore_draft
# ---------------------------------------------------------------------------

class TestRestoreDraft:
    def _make_state(self):
        from state.phase1 import Phase1State
        return _bare_state(
            Phase1State,
            draft_restored=False,
            nl_draft="",
            nl_editor="",
            epic_subject_input="",
            epic_id_input="",
            compiled_stories=[],
            gherkin_edits=[],
        )

    def test_restores_nl_draft_from_file(self):
        from state.phase1 import Phase1State
        state = self._make_state()
        draft = {"epic_subject": "S", "epic_id": "1", "nl_draft": "Draft text",
                 "nl_editor": "Draft text", "compiled_stories": None, "gherkin_edits": []}
        with patch("state.phase1.context_manager") as mock_cm:
            mock_cm.load_draft.return_value = draft
            Phase1State.restore_draft.fn(state)
        assert state.nl_draft == "Draft text"

    def test_restores_nl_editor_separately(self):
        from state.phase1 import Phase1State
        state = self._make_state()
        draft = {"nl_draft": "Base", "nl_editor": "Edited",
                 "compiled_stories": None, "gherkin_edits": []}
        with patch("state.phase1.context_manager") as mock_cm:
            mock_cm.load_draft.return_value = draft
            Phase1State.restore_draft.fn(state)
        assert state.nl_editor == "Edited"

    def test_falls_back_nl_editor_to_nl_draft(self):
        from state.phase1 import Phase1State
        state = self._make_state()
        draft = {"nl_draft": "Base", "compiled_stories": None, "gherkin_edits": []}
        with patch("state.phase1.context_manager") as mock_cm:
            mock_cm.load_draft.return_value = draft
            Phase1State.restore_draft.fn(state)
        assert state.nl_editor == "Base"

    def test_restores_gherkin_edits_from_draft(self):
        from state.phase1 import Phase1State
        state = self._make_state()
        compiled = _make_valid_compiled(2)
        saved_edits = ["edited gherkin 0", "edited gherkin 1"]
        draft = {"nl_draft": "d", "nl_editor": "d",
                 "compiled_stories": compiled, "gherkin_edits": saved_edits}
        with patch("state.phase1.context_manager") as mock_cm:
            mock_cm.load_draft.return_value = draft
            Phase1State.restore_draft.fn(state)
        assert state.gherkin_edits[0] == "edited gherkin 0"
        assert state.gherkin_edits[1] == "edited gherkin 1"

    def test_guard_prevents_double_restore(self):
        from state.phase1 import Phase1State
        state = self._make_state()
        state.draft_restored = True
        with patch("state.phase1.context_manager") as mock_cm:
            mock_cm.load_draft.return_value = {"nl_draft": "x"}
            Phase1State.restore_draft.fn(state)
        assert state.nl_draft == ""

    def test_no_draft_leaves_state_empty(self):
        from state.phase1 import Phase1State
        state = self._make_state()
        with patch("state.phase1.context_manager") as mock_cm:
            mock_cm.load_draft.return_value = None
            Phase1State.restore_draft.fn(state)
        assert state.nl_draft == ""


# ---------------------------------------------------------------------------
# Phase1State — request_mode_switch / confirm / cancel
# ---------------------------------------------------------------------------

class TestModeSwitch:
    def _make_state(self, nl_draft="", compiled=None):
        from state.phase1 import Phase1State
        return _bare_state(
            Phase1State,
            start_mode="new",
            nl_draft=nl_draft,
            compiled_stories=compiled or [],
            gherkin_edits=[],
            epic_subject_input="",
            discard_dialog_open=False,
            pending_mode_switch="",
            nl_editor="",
            story_subject="",
            push_done=False,
            push_result={},
            ai_error="",
            compile_error="",
            push_error="",
        )

    def test_switch_without_progress_changes_mode_immediately(self):
        from state.phase1 import Phase1State
        state = self._make_state()
        Phase1State.request_mode_switch.fn(state, "load")
        assert state.start_mode == "load"
        assert not state.discard_dialog_open

    def test_switch_with_progress_opens_dialog(self):
        from state.phase1 import Phase1State
        state = self._make_state(nl_draft="some draft")
        Phase1State.request_mode_switch.fn(state, "load")
        assert state.discard_dialog_open
        assert state.pending_mode_switch == "load"

    def test_confirm_applies_switch(self):
        from state.phase1 import Phase1State
        state = self._make_state(nl_draft="some draft")
        state.pending_mode_switch = "suggest"
        state.discard_dialog_open = True
        with patch("state.phase1.context_manager"):
            Phase1State.confirm_mode_switch.fn(state)
        assert state.start_mode == "suggest"
        assert not state.discard_dialog_open

    def test_cancel_leaves_mode_unchanged(self):
        from state.phase1 import Phase1State
        state = self._make_state(nl_draft="some draft")
        state.pending_mode_switch = "load"
        state.discard_dialog_open = True
        Phase1State.cancel_mode_switch.fn(state)
        assert state.start_mode == "new"
        assert not state.discard_dialog_open
