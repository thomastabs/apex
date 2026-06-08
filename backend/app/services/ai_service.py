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

    def generate_tasks(
        self,
        story_subject: str,
        gherkin: str,
        technical_spec: str,
        tech_stack: str = "",
        design_bundle: str = "",
        github_context: str = "",
    ) -> list[dict]:
        result = ai_engine.generate_tasks(
            story_subject, gherkin, technical_spec,
            tech_stack=tech_stack, design_bundle=design_bundle, github_context=github_context,
        )
        return [
            {
                "id": t.id,
                "subject": t.subject,
                "description": t.description,
                "effort_estimate": t.effort_estimate,
                "covered_scenarios": t.covered_scenarios,
                "predecessor_task_ids": t.predecessor_task_ids,
            }
            for t in result.tasks
        ]

    def generate_proposal(
        self,
        task_subject: str,
        task_description: str,
        gherkin: str,
        technical_spec: str,
        tech_stack: str = "",
        design_bundle: str = "",
        story_ref: str = "",
        github_context: str = "",
        hint: str = "",
        recent_commits: str = "",
        other_tasks: list[dict] | None = None,
    ) -> str:
        return ai_engine.generate_coding_proposal(
            task_subject, task_description, gherkin, technical_spec,
            tech_stack=tech_stack, design_bundle=design_bundle, story_ref=story_ref,
            github_context=github_context, hint=hint, recent_commits=recent_commits,
            other_tasks=other_tasks or [],
        )

    def generate_er_diagram(self, data_model_md: str):
        return ai_engine.extract_er_diagram(data_model_md)

    def generate_screen_flow(self, ux_brief_md: str):
        return ai_engine.extract_screen_flow(ux_brief_md)

    def generate_test_plan(
        self,
        story_subject: str,
        gherkin: str,
        technical_spec: str,
        tech_stack: str = "",
    ) -> str:
        return ai_engine.generate_test_plan(
            story_subject, gherkin, technical_spec, tech_stack=tech_stack,
        )

    def generate_bug_report(
        self,
        story_subject: str,
        gherkin: str,
        technical_spec: str,
        failed_scenario: str,
        qa_notes: str,
    ) -> str:
        return ai_engine.generate_bug_report(
            story_subject, gherkin, technical_spec, failed_scenario, qa_notes,
        )

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
