"""Unit tests for components/phase1.py — validation logic and pure utilities."""

import pytest
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_valid_compiled(n: int = 1) -> list[dict]:
    """Return n valid compiled-story dicts."""
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


def _mock_ss(data: dict):
    """Return a MagicMock that behaves like st.session_state for get() calls."""
    mock = MagicMock()
    mock.get = lambda key, default=None: data.get(key, default)
    return mock


# ---------------------------------------------------------------------------
# _validate_compiled_stories
# ---------------------------------------------------------------------------

class TestValidateCompiledStories:
    def _validate(self, compiled, ss_override=None):
        import streamlit as st
        from components.phase1 import _validate_compiled_stories
        ss_data = ss_override or {
            f"gherkin_edit_{i}": item["gherkin"] for i, item in enumerate(compiled)
        }
        with patch.object(st, "session_state", _mock_ss(ss_data)):
            return _validate_compiled_stories(compiled)

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
        compiled[0]["gherkin"] = "  Scenario: s\n    Given x\n    When y\n    Then z\n"
        errors = self._validate(compiled, ss_override={
            "gherkin_edit_0": compiled[0]["gherkin"]
        })
        assert any("Feature" in e for e in errors)

    def test_missing_scenario_block_reports_error(self):
        compiled = _make_valid_compiled(1)
        compiled[0]["gherkin"] = "Feature: X\n"
        errors = self._validate(compiled, ss_override={"gherkin_edit_0": "Feature: X\n"})
        assert any("Scenario" in e for e in errors)

    def test_session_state_gherkin_takes_precedence_over_item_gherkin(self):
        compiled = _make_valid_compiled(1)
        compiled[0]["gherkin"] = "Feature: X\n"  # invalid in item
        valid_gherkin = (
            "Feature: Valid\n\n"
            "  Scenario: s\n    Given x\n    When y\n    Then z\n"
        )
        errors = self._validate(compiled, ss_override={"gherkin_edit_0": valid_gherkin})
        assert errors == []

    def test_falls_back_to_item_gherkin_when_session_state_empty(self):
        compiled = _make_valid_compiled(1)
        errors = self._validate(compiled, ss_override={"gherkin_edit_0": ""})
        assert errors == []

    def test_error_label_uses_title_when_present(self):
        compiled = _make_valid_compiled(1)
        compiled[0]["gherkin"] = "Feature: X\n"  # no Scenario
        errors = self._validate(compiled, ss_override={"gherkin_edit_0": "Feature: X\n"})
        assert any("Story 1" in e for e in errors)

    def test_error_label_uses_positional_when_no_title(self):
        compiled = _make_valid_compiled(1)
        compiled[0]["title"] = ""
        compiled[0]["gherkin"] = "Feature: X\n"
        errors = self._validate(compiled, ss_override={"gherkin_edit_0": "Feature: X\n"})
        assert any("Story 1" in e for e in errors)

    def test_scenario_outline_counts_as_valid_scenario(self):
        compiled = _make_valid_compiled(1)
        compiled[0]["gherkin"] = (
            "Feature: X\n\n"
            "  Scenario Outline: parameterised\n"
            "    Given <input>\n    When action\n    Then <output>\n"
        )
        errors = self._validate(compiled, ss_override={
            "gherkin_edit_0": compiled[0]["gherkin"]
        })
        assert errors == []

    def test_two_stories_first_invalid_second_valid(self):
        compiled = _make_valid_compiled(2)
        compiled[0]["gherkin"] = "Feature: X\n"
        ss = {
            "gherkin_edit_0": "Feature: X\n",
            "gherkin_edit_1": compiled[1]["gherkin"],
        }
        errors = self._validate(compiled, ss_override=ss)
        assert len(errors) == 1


# ---------------------------------------------------------------------------
# _parse_epic_id
# ---------------------------------------------------------------------------

class TestParseEpicId:
    def _parse(self, raw_value: str):
        import streamlit as st
        from components.phase1 import _parse_epic_id
        with patch.object(st, "session_state", _mock_ss({"epic_id_input": raw_value})):
            return _parse_epic_id()

    def test_valid_integer_string(self):
        assert self._parse("42") == 42

    def test_empty_string_returns_none(self):
        assert self._parse("") is None

    def test_whitespace_only_returns_none(self):
        assert self._parse("   ") is None

    def test_non_numeric_returns_none(self):
        assert self._parse("abc") is None

    def test_float_string_returns_none(self):
        assert self._parse("3.14") is None

    def test_zero_is_valid_integer(self):
        assert self._parse("0") == 0


# ---------------------------------------------------------------------------
# _add_story / _delete_story
# ---------------------------------------------------------------------------

class TestAddAndDeleteStory:
    def _call_add(self, compiled: list[dict]):
        import streamlit as st
        from components.phase1 import _add_story
        ss_data = {f"gherkin_edit_{i}": item["gherkin"] for i, item in enumerate(compiled)}
        mock_ss = MagicMock()
        mock_ss.get = lambda key, default=None: ss_data.get(key, default)
        mock_ss.__getitem__ = lambda self, key: ss_data[key]
        mock_ss.__setitem__ = lambda self, key, val: ss_data.update({key: val})
        mock_ss.compiled_stories = compiled
        with patch.object(st, "session_state", mock_ss):
            _add_story()
        return compiled

    def _call_delete(self, compiled: list[dict], index: int):
        import streamlit as st
        from components.phase1 import _delete_story
        ss_data = {f"gherkin_edit_{i}": item["gherkin"] for i, item in enumerate(compiled)}
        mock_ss = MagicMock()
        mock_ss.get = lambda key, default=None: ss_data.get(key, default)
        mock_ss.__getitem__ = lambda self, key: ss_data[key]
        mock_ss.__setitem__ = lambda self, key, val: ss_data.update({key: val})
        mock_ss.__contains__ = lambda self, key: key in ss_data
        mock_ss.compiled_stories = compiled
        with patch.object(st, "session_state", mock_ss):
            _delete_story(index)
        return compiled

    def test_add_story_increases_list_length(self):
        compiled = _make_valid_compiled(2)
        result = self._call_add(compiled)
        assert len(result) == 3

    def test_add_story_has_default_title(self):
        compiled = _make_valid_compiled(1)
        self._call_add(compiled)
        assert compiled[-1]["title"] == "New Story"

    def test_add_story_has_feature_header(self):
        compiled = _make_valid_compiled(1)
        self._call_add(compiled)
        assert "Feature:" in compiled[-1]["gherkin"]

    def test_delete_story_decreases_list_length(self):
        compiled = _make_valid_compiled(3)
        self._call_delete(compiled, 1)
        assert len(compiled) == 2

    def test_delete_correct_story(self):
        compiled = _make_valid_compiled(3)
        title_to_delete = compiled[1]["title"]
        self._call_delete(compiled, 1)
        titles = [s["title"] for s in compiled]
        assert title_to_delete not in titles

    def test_delete_first_story(self):
        compiled = _make_valid_compiled(2)
        second_title = compiled[1]["title"]
        self._call_delete(compiled, 0)
        assert compiled[0]["title"] == second_title


# ---------------------------------------------------------------------------
# _classify_ai_error
# ---------------------------------------------------------------------------

class TestClassifyAiError:
    def _classify(self, exc: Exception) -> str:
        from components.phase1 import _classify_ai_error
        return _classify_ai_error(exc)

    def test_ai_rate_limit_error_returns_friendly_message(self):
        from src.ai_engine import AIRateLimitError
        result = self._classify(AIRateLimitError("quota exceeded"))
        assert "Rate limit" in result
        assert "429" in result

    def test_ai_timeout_error_returns_friendly_message(self):
        from src.ai_engine import AITimeoutError
        result = self._classify(AITimeoutError("connection timed out"))
        assert "timed out" in result.lower() or "timeout" in result.lower()

    def test_429_string_falls_through_to_pattern_match(self):
        result = self._classify(Exception("HTTP 429 too many requests"))
        assert "Rate limit" in result

    def test_rate_limit_keyword_in_message(self):
        result = self._classify(Exception("rate_limit exceeded for model"))
        assert "Rate limit" in result

    def test_generic_exception_returns_raw_message(self):
        result = self._classify(ValueError("something completely unexpected"))
        assert "something completely unexpected" in result
