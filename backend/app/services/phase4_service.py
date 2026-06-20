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
        self.context.set_active(ctx)

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
        constraints = self.context.read_context_file("constraints.md")
        # Ground the test plan in how the story was actually built — the saved
        # developer packs (digested to Context + Files to Change downstream).
        developer_packs = [
            {"subject": f"Task {p['task_id']}", "proposal_md": p.get("proposal_md", "")}
            for p in self.context.load_proposals(story_id)
        ]
        return self.ai.generate_test_plan(
            story_title, gherkin, technical_spec, tech_stack=tech_stack,
            developer_packs=developer_packs, constraints=constraints,
        )

    def save_test_plan(self, ctx: RequestContext, story_id: int, test_plan_md: str) -> None:
        self.configure_request(ctx)
        self.context.save_bdd_tests(story_id, test_plan_md)

    def delete_test_plan(self, ctx: RequestContext, story_id: int) -> None:
        """Clear a story's test plan; rolls qa status back to implementation."""
        self.configure_request(ctx)
        self.context.delete_bdd_tests(story_id)
        _logger.info("Phase 4 test plan cleared for story %s", story_id)

    def load_test_plan(self, ctx: RequestContext, story_id: int) -> str:
        self.configure_request(ctx)
        return self.context.load_bdd_tests(story_id)

    def list_all_test_plans(self, ctx: RequestContext) -> list[dict]:
        """All saved test plans in the project, annotated with story titles."""
        self.configure_request(ctx)
        index = self.context.story_index()
        plans = []
        for entry in index.values():
            if not entry.get("has_bdd"):
                continue
            story_id = entry.get("story_id")
            if not story_id:
                continue
            md = self.context.load_bdd_tests(story_id)
            if not md.strip():
                continue
            plans.append({
                "story_id": story_id,
                "title": entry.get("title", ""),
                "chars": len(md),
            })
        return sorted(plans, key=lambda p: p["story_id"])

    # ── Fix-Bolt artifacts (bug reports + fix log) ────────────────────────────

    def list_all_bug_reports(self, ctx: RequestContext) -> list[dict]:
        """All saved Fix-Bolt bug reports in the project, annotated with titles."""
        self.configure_request(ctx)
        return self.context.list_all_bug_reports()

    def load_bug_report(self, ctx: RequestContext, story_id: int) -> str:
        self.configure_request(ctx)
        return self.context.load_bug_report(story_id)

    def save_bug_report(self, ctx: RequestContext, story_id: int, bug_md: str) -> None:
        self.configure_request(ctx)
        if str(story_id) not in self.context.story_index():
            raise Phase4ValidationError(f"Story {story_id} not found in index.")
        self.context.save_bug_report(story_id, bug_md)

    def delete_bug_report(self, ctx: RequestContext, story_id: int) -> None:
        """Delete the bug-report file; keeps has_bug_report (regression-bypass safe)."""
        self.configure_request(ctx)
        self.context.delete_bug_report(story_id)
        _logger.info("Phase 4 bug report deleted for story %s (flag kept)", story_id)

    def get_fix_log(self, ctx: RequestContext) -> str:
        self.configure_request(ctx)
        return self.context.get_fix_log()

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

    def generate_edge_cases(self, ctx: RequestContext, story_id: int, scenario_text: str) -> str:
        self.configure_request(ctx)
        if not scenario_text.strip():
            raise Phase4ValidationError("A scenario is required to explore edge cases.")
        if str(story_id) not in self.context.story_index():
            raise Phase4ValidationError(f"Story {story_id} not found in index.")
        technical_spec = self.context.story_technical_spec(story_id)
        return self.ai.generate_edge_cases(scenario_text, technical_spec)

    def pass_gate(
        self,
        ctx: RequestContext,
        story_id: int,
        scenario_results: list[dict] | None = None,
    ) -> None:
        self.configure_request(ctx)
        if scenario_results:
            self.context.save_qa_results(story_id, "pass", scenario_results)
        self.context.upsert_story_index(story_id, phase_status="qa_passed")
        _logger.info("Phase 4 gate passed for story %s", story_id)

    def fail_gate(
        self,
        ctx: RequestContext,
        story_id: int,
        bug_report_md: str,
        root_cause: str,
        resolution_summary: str,
        scenario_results: list[dict] | None = None,
    ) -> None:
        self.configure_request(ctx)
        if scenario_results:
            self.context.save_qa_results(story_id, "fail", scenario_results)
        # Save per-story bug report
        self.context.save_bug_report(story_id, bug_report_md)
        # Each failed gate triggers one Fix-Bolt — the AI-defect-rate proxy
        self.context.increment_story_counter(story_id, "fix_bolt_count")
        # Append to global fix log
        if root_cause.strip():
            self.context.append_fix_log_record(
                story_id,
                root_cause.strip(),
                resolution_summary.strip() or "Fix-Bolt triggered — resolution pending.",
            )
        # push_to_pm is handled client-side via the PM adapter (TypeScript)
        _logger.info("Phase 4 gate failed for story %s — bug report saved", story_id)
