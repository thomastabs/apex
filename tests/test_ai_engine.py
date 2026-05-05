"""Unit tests for ai_engine.py — pure formatting and utility functions."""


import pytest

from src.ai_engine import (
    NLScenario,
    NLStory,
    NLStoryList,
    GherkinScenario,
    GherkinStory,
    GherkinStoryList,
    EpicSuggestion,
    EpicSuggestionList,
    _repair_truncated_json,
    _reclassify_llm_exc,
    bold_gherkin_keywords,
    format_gherkin_story,
    format_nl_draft,
)


# ---------------------------------------------------------------------------
# format_nl_draft
# ---------------------------------------------------------------------------

class TestFormatNlDraft:
    def _story(self, title="Story A", size="S", scenarios=None):
        if scenarios is None:
            scenarios = [NLScenario(title="Happy path", description="User does X and sees Y.")]
        return NLStory(title=title, size=size, scenarios=scenarios)

    def test_empty_story_list(self):
        result = format_nl_draft(NLStoryList(stories=[]))
        assert result == ""

    def test_single_story_contains_title_and_size(self):
        result = format_nl_draft(NLStoryList(stories=[self._story()]))
        assert "[S] Story A" in result

    def test_single_story_contains_scenario_title(self):
        result = format_nl_draft(NLStoryList(stories=[self._story()]))
        assert "Happy path" in result

    def test_single_story_contains_scenario_description(self):
        result = format_nl_draft(NLStoryList(stories=[self._story()]))
        assert "User does X and sees Y." in result

    def test_multiple_stories_separated_by_divider(self):
        stories = [self._story("Story A"), self._story("Story B")]
        result = format_nl_draft(NLStoryList(stories=stories))
        assert "---" in result
        assert "Story A" in result
        assert "Story B" in result

    def test_xs_size_label(self):
        result = format_nl_draft(NLStoryList(stories=[self._story(size="XS")]))
        assert "[XS]" in result

    def test_multiple_scenarios_all_present(self):
        scenarios = [
            NLScenario(title="Happy path",   description="Goes well."),
            NLScenario(title="Error case",   description="Fails gracefully."),
        ]
        result = format_nl_draft(NLStoryList(stories=[self._story(scenarios=scenarios)]))
        assert "Happy path" in result
        assert "Error case" in result


# ---------------------------------------------------------------------------
# format_gherkin_story
# ---------------------------------------------------------------------------

class TestFormatGherkinStory:
    def _scenario(self, title="Log in", given=None, when=None, then=None):
        return GherkinScenario(
            title=title,
            given=given or ["the user is on the login page"],
            when=when  or ["they enter valid credentials"],
            then=then  or ["they are redirected to the dashboard"],
        )

    def _story(self, title="User Login", scenarios=None):
        return GherkinStory(title=title, size="S",
                            scenarios=scenarios or [self._scenario()])

    def test_feature_header(self):
        result = format_gherkin_story(self._story())
        assert result.startswith("Feature: User Login")

    def test_scenario_title(self):
        result = format_gherkin_story(self._story())
        assert "Scenario: Log in" in result

    def test_given_step(self):
        result = format_gherkin_story(self._story())
        assert "Given the user is on the login page" in result

    def test_when_step(self):
        result = format_gherkin_story(self._story())
        assert "When they enter valid credentials" in result

    def test_then_step(self):
        result = format_gherkin_story(self._story())
        assert "Then they are redirected to the dashboard" in result

    def test_multiple_given_steps_use_and(self):
        sc = self._scenario(given=["step one", "step two", "step three"])
        result = format_gherkin_story(self._story(scenarios=[sc]))
        assert "Given step one" in result
        assert "And step two" in result
        assert "And step three" in result

    def test_multiple_scenarios_all_present(self):
        sc1 = self._scenario("Happy path")
        sc2 = self._scenario("Sad path",
                             when=["they enter wrong password"],
                             then=["an error is shown"])
        result = format_gherkin_story(self._story(scenarios=[sc1, sc2]))
        assert "Scenario: Happy path" in result
        assert "Scenario: Sad path" in result

    def test_empty_given_not_written(self):
        sc = GherkinScenario(title="Minimal", given=[], when=["action"], then=["result"])
        result = format_gherkin_story(self._story(scenarios=[sc]))
        assert "Given" not in result
        assert "When action" in result


# ---------------------------------------------------------------------------
# bold_gherkin_keywords
# ---------------------------------------------------------------------------

class TestBoldGherkinKeywords:
    def test_feature_keyword(self):
        result = bold_gherkin_keywords("Feature: Login")
        assert "**Feature:**" in result

    def test_scenario_keyword(self):
        result = bold_gherkin_keywords("  Scenario: Happy path")
        assert "**Scenario:**" in result

    def test_given_step(self):
        result = bold_gherkin_keywords("    Given the user is logged in")
        assert "**Given** the user is logged in" in result

    def test_when_step(self):
        result = bold_gherkin_keywords("    When they click submit")
        assert "**When** they click submit" in result

    def test_then_step(self):
        result = bold_gherkin_keywords("    Then the form is saved")
        assert "**Then** the form is saved" in result

    def test_and_step(self):
        result = bold_gherkin_keywords("    And another step")
        assert "**And** another step" in result

    def test_but_step(self):
        result = bold_gherkin_keywords("    But not this")
        assert "**But** not this" in result

    def test_scenario_outline_keyword(self):
        result = bold_gherkin_keywords("  Scenario Outline: Parameterised")
        assert "**Scenario Outline:**" in result

    def test_background_keyword(self):
        result = bold_gherkin_keywords("Background: Setup")
        assert "**Background:**" in result

    def test_examples_keyword(self):
        result = bold_gherkin_keywords("  Examples: table")
        assert "**Examples:**" in result

    def test_full_gherkin_block(self):
        gherkin = (
            "Feature: Login\n\n"
            "  Scenario: Valid login\n"
            "    Given the user is on the login page\n"
            "    When they submit valid credentials\n"
            "    Then they see the dashboard\n"
        )
        result = bold_gherkin_keywords(gherkin)
        assert "**Feature:**" in result
        assert "**Scenario:**" in result
        assert "**Given**" in result
        assert "**When**" in result
        assert "**Then**" in result

    def test_plain_text_unchanged(self):
        text = "this has no gherkin keywords at all"
        assert bold_gherkin_keywords(text) == text


# ---------------------------------------------------------------------------
# _repair_truncated_json
# ---------------------------------------------------------------------------

class TestRepairTruncatedJson:
    def test_complete_json_unchanged(self):
        import json
        data = '{"stories": [{"title": "A", "size": "S"}]}'
        result = _repair_truncated_json(data)
        assert json.loads(result) == {"stories": [{"title": "A", "size": "S"}]}

    def test_missing_closing_brace(self):
        import json
        truncated = '{"stories": [{"title": "A"}'
        result = _repair_truncated_json(truncated)
        parsed = json.loads(result)
        assert "stories" in parsed

    def test_missing_closing_bracket_and_brace(self):
        import json
        # Array of scalars — closing ] then } produces valid JSON
        truncated = '{"stories": [1, 2'
        result = _repair_truncated_json(truncated)
        parsed = json.loads(result)
        assert "stories" in parsed

    def test_open_string_is_closed(self):
        truncated = '{"key": "val'
        result = _repair_truncated_json(truncated)
        import json
        parsed = json.loads(result)
        assert "key" in parsed

    def test_trailing_comma_stripped(self):
        import json
        # Trailing comma at string end (truncated array) is stripped before closing
        truncated = '{"stories": [{"title": "A"},'
        result = _repair_truncated_json(truncated)
        parsed = json.loads(result)
        assert "stories" in parsed


# ---------------------------------------------------------------------------
# Error classes
# ---------------------------------------------------------------------------

class TestAIErrorClasses:
    def test_ai_error_is_exception(self):
        from src.ai_engine import AIError
        assert issubclass(AIError, Exception)

    def test_ai_rate_limit_error_is_ai_error(self):
        from src.ai_engine import AIError, AIRateLimitError
        assert issubclass(AIRateLimitError, AIError)

    def test_ai_validation_error_is_ai_error(self):
        from src.ai_engine import AIError, AIValidationError
        assert issubclass(AIValidationError, AIError)

    def test_ai_timeout_error_is_ai_error(self):
        from src.ai_engine import AIError, AITimeoutError
        assert issubclass(AITimeoutError, AIError)

    def test_ai_validation_error_raised_on_unrecoverable_json(self):
        """_invoke_json_fallback raises AIValidationError when repair also fails."""
        from unittest.mock import MagicMock, patch
        from src.ai_engine import AIValidationError, NLStoryList, _invoke_json_fallback

        bad_response = MagicMock()
        bad_response.content = "NOT JSON AT ALL %%%"

        with patch("src.ai_engine._get_llm") as mock_get_llm:
            mock_llm = MagicMock()
            mock_llm.invoke.return_value = bad_response
            mock_get_llm.return_value = mock_llm

            with pytest.raises(AIValidationError):
                _invoke_json_fallback(
                    "system", "human", "model", NLStoryList, 2048,
                )

    def test_errors_carry_message(self):
        from src.ai_engine import AIRateLimitError
        exc = AIRateLimitError("quota exceeded")
        assert "quota exceeded" in str(exc)


# ---------------------------------------------------------------------------
# _reclassify_llm_exc
# ---------------------------------------------------------------------------

class TestReclassifyLlmExc:
    def test_429_in_message_raises_rate_limit_error(self):
        from src.ai_engine import AIRateLimitError
        with pytest.raises(AIRateLimitError):
            _reclassify_llm_exc(Exception("HTTP 429 rate_limit exceeded"))

    def test_overloaded_raises_rate_limit_error(self):
        from src.ai_engine import AIRateLimitError
        with pytest.raises(AIRateLimitError):
            _reclassify_llm_exc(Exception("model is overloaded, try again"))

    def test_quota_raises_rate_limit_error(self):
        from src.ai_engine import AIRateLimitError
        with pytest.raises(AIRateLimitError):
            _reclassify_llm_exc(Exception("quota exceeded for this project"))

    def test_timeout_raises_ai_timeout_error(self):
        from src.ai_engine import AITimeoutError
        with pytest.raises(AITimeoutError):
            _reclassify_llm_exc(Exception("request timed out after 30s"))

    def test_timed_out_phrase_raises_ai_timeout_error(self):
        from src.ai_engine import AITimeoutError
        with pytest.raises(AITimeoutError):
            _reclassify_llm_exc(Exception("connection timed out"))

    def test_generic_exc_reraises_original_when_reraise_true(self):
        exc = ValueError("some other problem")
        with pytest.raises(ValueError, match="some other problem"):
            _reclassify_llm_exc(exc)

    def test_generic_exc_silenced_when_reraise_false(self):
        exc = ValueError("transient streaming blip")
        _reclassify_llm_exc(exc, reraise_unrecognized=False)  # must not raise

    def test_fatal_exc_still_raises_when_reraise_false(self):
        from src.ai_engine import AIRateLimitError
        with pytest.raises(AIRateLimitError):
            _reclassify_llm_exc(Exception("429 too many requests"), reraise_unrecognized=False)


# ---------------------------------------------------------------------------
# format_nl_draft — edge cases
# ---------------------------------------------------------------------------

class TestFormatNlDraftEdgeCases:
    def test_story_with_no_scenarios_renders_title(self):
        result = format_nl_draft(NLStoryList(stories=[
            NLStory(title="Empty story", size="S", scenarios=[])
        ]))
        assert "[S] Empty story" in result

    def test_output_does_not_end_with_newline(self):
        result = format_nl_draft(NLStoryList(stories=[
            NLStory(title="A", size="XS",
                    scenarios=[NLScenario(title="T", description="D")])
        ]))
        assert not result.endswith("\n")

    def test_divider_only_between_stories_not_after_last(self):
        stories = [
            NLStory(title="A", size="S",
                    scenarios=[NLScenario(title="T", description="D")]),
            NLStory(title="B", size="S",
                    scenarios=[NLScenario(title="T2", description="D2")]),
        ]
        result = format_nl_draft(NLStoryList(stories=stories))
        # There is at least one divider between stories
        assert result.count("---") >= 1


# ---------------------------------------------------------------------------
# format_gherkin_story — edge cases
# ---------------------------------------------------------------------------

class TestFormatGherkinStoryEdgeCases:
    def _sc(self, given=None, when=None, then=None):
        return GherkinScenario(
            title="T",
            given=given or [],
            when=when or ["action"],
            then=then or ["result"],
        )

    def _story(self, scenarios=None):
        return GherkinStory(title="S", size="S", scenarios=scenarios or [self._sc()])

    def test_multiple_when_steps_first_uses_when_rest_use_and(self):
        sc = self._sc(when=["w1", "w2", "w3"])
        result = format_gherkin_story(self._story([sc]))
        assert "When w1" in result
        assert "And w2" in result
        assert "And w3" in result

    def test_multiple_then_steps_first_uses_then_rest_use_and(self):
        sc = self._sc(then=["t1", "t2"])
        result = format_gherkin_story(self._story([sc]))
        assert "Then t1" in result
        assert "And t2" in result

    def test_empty_when_not_written(self):
        sc = GherkinScenario(title="T", given=["pre"], when=[], then=["result"])
        result = format_gherkin_story(self._story([sc]))
        assert "When" not in result

    def test_empty_then_not_written(self):
        sc = GherkinScenario(title="T", given=["pre"], when=["action"], then=[])
        result = format_gherkin_story(self._story([sc]))
        assert "Then" not in result

    def test_empty_scenarios_list_still_has_feature_header(self):
        story = GherkinStory(title="No Scenarios", size="XS", scenarios=[])
        result = format_gherkin_story(story)
        assert "Feature: No Scenarios" in result


# ---------------------------------------------------------------------------
# EpicSuggestion / EpicSuggestionList schemas
# ---------------------------------------------------------------------------

class TestEpicSuggestionSchema:
    def test_valid_suggestion_stores_fields(self):
        s = EpicSuggestion(title="User Authentication", description="Handles login flows.")
        assert s.title == "User Authentication"
        assert s.description == "Handles login flows."

    def test_suggestion_list_empty_is_valid(self):
        sl = EpicSuggestionList(epics=[])
        assert sl.epics == []

    def test_suggestion_list_multiple_epics(self):
        sl = EpicSuggestionList(epics=[
            EpicSuggestion(title="Auth",      description="Login and registration."),
            EpicSuggestion(title="Dashboard", description="User dashboard views."),
        ])
        assert len(sl.epics) == 2
        assert sl.epics[0].title == "Auth"
        assert sl.epics[1].title == "Dashboard"

    def test_suggestion_missing_title_raises(self):
        import pydantic
        with pytest.raises(pydantic.ValidationError):
            EpicSuggestion(description="No title here.")

    def test_suggestion_missing_description_raises(self):
        import pydantic
        with pytest.raises(pydantic.ValidationError):
            EpicSuggestion(title="No description here")

    def test_suggestion_list_missing_epics_raises(self):
        import pydantic
        with pytest.raises(pydantic.ValidationError):
            EpicSuggestionList()

    def test_suggestion_list_preserves_order(self):
        titles = ["Epic A", "Epic B", "Epic C"]
        sl = EpicSuggestionList(epics=[
            EpicSuggestion(title=t, description=f"Desc for {t}") for t in titles
        ])
        assert [e.title for e in sl.epics] == titles

    def test_suggestion_json_round_trip(self):
        original = EpicSuggestion(title="Payments", description="Checkout and billing.")
        restored = EpicSuggestion.model_validate_json(original.model_dump_json())
        assert restored.title == original.title
        assert restored.description == original.description
