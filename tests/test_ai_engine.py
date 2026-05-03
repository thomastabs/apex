"""Unit tests for ai_engine.py — pure formatting and utility functions."""


import pytest

from ai_engine import (
    NLScenario,
    NLStory,
    NLStoryList,
    GherkinScenario,
    GherkinStory,
    GherkinStoryList,
    _repair_truncated_json,
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
