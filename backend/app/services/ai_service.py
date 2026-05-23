"""AI operations used by the FastAPI backend."""

from src import ai_engine


class AiService:
    def suggest_epics(self, project_concept: str, hint: str) -> list[dict]:
        result = ai_engine.suggest_epics(project_concept, hint)
        return [
            {"title": epic.title, "description": epic.description}
            for epic in result.epics
        ]

    def generate_nl_stories(
        self,
        epic_subject: str,
        epic_description: str,
        *,
        hint: str,
        project_concept: str,
    ) -> tuple[str, int]:
        result = ai_engine.generate_nl_stories(
            epic_subject,
            epic_description,
            hint=hint,
            project_concept=project_concept,
        )
        return ai_engine.format_nl_draft(result), len(result.stories)

    def compile_gherkin(self, nl_draft: str) -> list[dict]:
        result = ai_engine.compile_gherkin_stories(nl_draft)
        return [
            {
                "title": story.title,
                "size": story.size,
                "gherkin": ai_engine.format_gherkin_story(story),
            }
            for story in result.stories
        ]

    def bold_gherkin_keywords(self, gherkin: str) -> str:
        return ai_engine.bold_gherkin_keywords(gherkin)

    def suggest_tech_stack(
        self,
        all_stories: list[dict],
        context: str,
        hint: str,
    ) -> list[dict]:
        return ai_engine.suggest_tech_stack(all_stories, context, hint)

    def generate_design_section(
        self,
        all_stories: list[dict],
        context: str,
        section: str,
        prior_sections: dict[str, str],
    ) -> str:
        if section == "ux_brief":
            return ai_engine.generate_design_ux_brief(all_stories, context)
        if section == "endpoints":
            return ai_engine.generate_design_endpoints(
                all_stories, context,
                ux_brief=prior_sections.get("ux_brief", ""),
            )
        if section == "data_model":
            return ai_engine.generate_design_data_model(
                all_stories, context,
                endpoints=prior_sections.get("endpoints", ""),
            )
        raise ValueError(f"Unknown design section: {section!r}")
