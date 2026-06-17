"""Phase 1 requirements workflow service."""

from backend.app.services.ai_service import AiService
from backend.app.services.context_service import ContextService
from backend.app.services.request_context import RequestContext


class Phase1ValidationError(ValueError):
    """Raised when a Phase 1 request is structurally invalid."""


class Phase1Service:
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

    def suggest_epics(self, ctx: RequestContext, *, hint: str = "") -> list[dict]:
        self.configure_request(ctx)
        concept = self.context.project_concept()
        return self.ai.suggest_epics(concept, hint)

    def generate_nl_stories(
        self,
        ctx: RequestContext,
        *,
        epic_subject: str,
        epic_description: str,
        hint: str = "",
    ) -> tuple[str, int]:
        self.configure_request(ctx)
        subject = epic_subject.strip()
        if not subject:
            raise Phase1ValidationError("epic_subject is required.")
        concept = self.context.project_concept()
        return self.ai.generate_nl_stories(
            subject,
            epic_description,
            hint=hint,
            project_concept=concept,
        )

    def compile_gherkin(self, *, nl_draft: str) -> list[dict]:
        if not nl_draft.strip():
            raise Phase1ValidationError("nl_draft is required.")
        return self.ai.compile_gherkin(nl_draft)

    def _all_stories(self) -> list[dict]:
        """Epic + story titles from the index — scope signal for constraint sizing."""
        return [
            {"epic_title": e.get("epic_title", "General"), "title": e.get("title", "")}
            for e in self.context.story_index().values()
        ]

    def generate_constraints(self, ctx: RequestContext) -> tuple[list[dict], str]:
        """Generate EARS constraints for the whole project."""
        self.configure_request(ctx)
        concept = self.context.project_concept()
        tech_stack = self.context.read_tech_stack()
        return self.ai.generate_constraints(concept, tech_stack, self._all_stories())

    def save_constraints(self, ctx: RequestContext, *, constraints_md: str) -> None:
        self.configure_request(ctx)
        self.context.init_context()
        self.context.write_context_file("constraints.md", constraints_md)

    def get_constraints(self, ctx: RequestContext) -> str:
        self.configure_request(ctx)
        return self.context.read_context_file("constraints.md")

    def finalize_stories(
        self,
        ctx: RequestContext,
        *,
        epic_id: int,
        epic_subject: str,
        stories: list[dict],
    ) -> dict:
        self.context.set_active(ctx)
        self.context.init_context()
        story_ids: list[int] = []
        for item in stories:
            story_id = int(item["id"])
            title = item["title"].strip()
            gherkin = item["gherkin"].strip()
            if not gherkin or "Scenario" not in gherkin:
                raise Phase1ValidationError(
                    f"Story '{title}' (id={story_id}) has invalid Gherkin — must contain at least one Scenario."
                )
            self.context.append_gherkin(
                story_id,
                title,
                gherkin,
                epic_id=epic_id,
                epic_title=epic_subject,
            )
            story_ids.append(story_id)
        return {
            "ok": True,
            "epic_id": epic_id,
            "count": len(story_ids),
            "story_ids": story_ids,
        }
