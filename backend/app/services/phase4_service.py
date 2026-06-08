"""Phase 4 QA assistant workflow service."""

import logging

from backend.app.services.ai_service import AiService
from backend.app.services.context_service import ContextService
from backend.app.services.request_context import RequestContext

_logger = logging.getLogger("apex.phase4_service")

_PREVIEW_CHARS = 600


class Phase4ValidationError(ValueError):
    """Raised when a Phase 4 request is structurally invalid."""


class Phase4Service:
    def __init__(
        self,
        *,
        ai: AiService | None = None,
        context: ContextService | None = None,
    ) -> None:
        self.ai = ai or AiService()
        self.context = context or ContextService()

    def configure_request(self, ctx: RequestContext) -> None:
        self.context.set_project(ctx.project_id)

    def get_eligible_stories(self, ctx: RequestContext) -> list[dict]:
        self.configure_request(ctx)
        index = self.context.story_index()
        stories = []
        for entry in index.values():
            status = entry.get("phase_status", "")
            # Show stories ready for QA (implementation) or already in QA (qa)
            if status not in ("implementation", "qa"):
                continue
            story_id = entry.get("story_id")
            if not story_id:
                continue
            gherkin = self.context.story_gherkin(story_id)
            has_bdd = entry.get("has_bdd", False)
            has_bug_report = entry.get("has_bug_report", False)
            # Regression bypass: previously failed (has_bug_report) and returned to implementation
            is_regression_bypass = has_bug_report and status == "implementation"
            stories.append({
                "story_id": story_id,
                "title": entry.get("title", ""),
                "epic_title": entry.get("epic_title", ""),
                "gherkin_preview": gherkin[:_PREVIEW_CHARS].strip(),
                "has_bdd": has_bdd,
                "has_bug_report": has_bug_report,
                "is_regression_bypass": is_regression_bypass,
            })
        return sorted(stories, key=lambda s: s["story_id"])

    def get_story_context(self, ctx: RequestContext, story_id: int) -> dict:
        self.configure_request(ctx)
        index = self.context.story_index()
        entry = index.get(str(story_id)) or {}
        if not entry:
            raise Phase4ValidationError(f"Story {story_id} not found in index.")
        status = entry.get("phase_status", "")
        if status not in ("implementation", "qa"):
            raise Phase4ValidationError(
                f"Story {story_id} is not eligible for Phase 4 (status: {status!r})."
            )
        return {
            "story_id": story_id,
            "title": entry.get("title", ""),
            "epic_title": entry.get("epic_title", ""),
            "gherkin": self.context.story_gherkin(story_id),
            "technical_spec": self.context.story_technical_spec(story_id),
            "tech_stack": self.context.read_tech_stack(),
            "task_list": self.context.load_task_list(story_id),
        }

    def generate_test_plan(self, ctx: RequestContext, story_id: int) -> str:
        self.configure_request(ctx)
        index = self.context.story_index()
        entry = index.get(str(story_id)) or {}
        status = entry.get("phase_status", "")
        if status not in ("implementation", "qa"):
            raise Phase4ValidationError(
                f"Story {story_id} is not eligible for Phase 4 (status: {status!r})."
            )
        story_title = entry.get("title", f"Story {story_id}")
        gherkin = self.context.story_gherkin(story_id)
        if not gherkin.strip():
            raise Phase4ValidationError(f"Story {story_id} has no Gherkin content.")
        technical_spec = self.context.story_technical_spec(story_id)
        tech_stack = self.context.read_tech_stack()
        return self.ai.generate_test_plan(
            story_title, gherkin, technical_spec, tech_stack=tech_stack,
        )

    def save_test_plan(self, ctx: RequestContext, story_id: int, test_plan_md: str) -> None:
        self.configure_request(ctx)
        from src import context_manager
        context_manager.save_bdd_tests(story_id, test_plan_md)

    def load_test_plan(self, ctx: RequestContext, story_id: int) -> str:
        self.configure_request(ctx)
        return self.context.load_bdd_tests(story_id)

    def generate_bug_report(
        self,
        ctx: RequestContext,
        story_id: int,
        failed_scenarios: list[dict],
    ) -> str:
        self.configure_request(ctx)
        index = self.context.story_index()
        entry = index.get(str(story_id)) or {}
        if not entry:
            raise Phase4ValidationError(f"Story {story_id} not found in index.")
        story_title = entry.get("title", f"Story {story_id}")
        gherkin = self.context.story_gherkin(story_id)
        technical_spec = self.context.story_technical_spec(story_id)

        # Combine all failed scenarios + notes into a single report call
        failed_text = "\n\n".join(
            f"Scenario: {fs['scenario_name']}\nQA Notes: {fs.get('qa_notes', '').strip() or 'No notes provided.'}"
            for fs in failed_scenarios
        )
        primary = failed_scenarios[0]
        return self.ai.generate_bug_report(
            story_title,
            gherkin,
            technical_spec,
            failed_scenario=primary["scenario_name"],
            qa_notes=failed_text,
        )

    def pass_gate(self, ctx: RequestContext, story_id: int) -> None:
        self.configure_request(ctx)
        from src import context_manager
        context_manager.upsert_story_index(story_id, phase_status="qa_passed")
        _logger.info("Phase 4 gate passed for story %s", story_id)

    def fail_gate(
        self,
        ctx: RequestContext,
        story_id: int,
        bug_report_md: str,
        root_cause: str,
        resolution_summary: str,
    ) -> None:
        self.configure_request(ctx)
        from src import context_manager
        # Save per-story bug report
        context_manager.save_bug_report(story_id, bug_report_md)
        # Append to global vaccine log
        if root_cause.strip():
            context_manager.append_vaccine_record(
                story_id,
                root_cause.strip(),
                resolution_summary.strip() or "Fix-Bolt triggered — resolution pending.",
            )
        # push_to_pm is handled client-side via the PM adapter (TypeScript)
        _logger.info("Phase 4 gate failed for story %s — bug report saved", story_id)
