"""Tests for the thin AiService wrapper over src.ai_engine — glue logic only
(the AI-facing behaviour itself is covered by tests/test_ai_engine.py)."""

from backend.app.services.ai_service import AiService
from src.ai_engine import GherkinScenario, GherkinStory, GherkinStoryList


class TestCompileGherkinAssumptions:
    def test_flattens_per_scenario_assumptions_with_title_prefix(self, monkeypatch):
        from src import ai_engine

        story = GherkinStory(
            title="Login",
            size="XS",
            scenarios=[
                GherkinScenario(
                    id="SC-1", title="Successful login", given=["g"], when=["w"], then=["t"],
                    assumptions=["assumed session lasts 24h"],
                ),
                GherkinScenario(id="SC-2", title="Failed login", given=["g"], when=["w"], then=["t"]),
            ],
        )
        monkeypatch.setattr(
            ai_engine, "compile_gherkin_stories",
            lambda nl_draft, clarifications=None: GherkinStoryList(stories=[story]),
        )

        result = AiService().compile_gherkin("some NL draft")

        assert len(result) == 1
        assert result[0]["assumptions"] == ["Successful login: assumed session lasts 24h"]

    def test_empty_assumptions_when_no_scenario_has_any(self, monkeypatch):
        from src import ai_engine

        story = GherkinStory(
            title="Login", size="XS",
            scenarios=[GherkinScenario(id="SC-1", title="Successful login", given=["g"], when=["w"], then=["t"])],
        )
        monkeypatch.setattr(
            ai_engine, "compile_gherkin_stories",
            lambda nl_draft, clarifications=None: GherkinStoryList(stories=[story]),
        )

        result = AiService().compile_gherkin("some NL draft")
        assert result[0]["assumptions"] == []
