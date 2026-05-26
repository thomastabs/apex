"""Phase 3 implementation-assist workflow service."""

import logging

from backend.app.services.ai_service import AiService
from backend.app.services.context_service import ContextService
from backend.app.services.request_context import RequestContext

_logger = logging.getLogger("apex.phase3_service")

_PREVIEW_CHARS = 3000


class Phase3ValidationError(ValueError):
    """Raised when a Phase 3 request is structurally invalid."""


class Phase3Service:
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
            if entry.get("phase_status") != "design_locked":
                continue
            story_id = entry.get("story_id")
            if not story_id:
                continue
            gherkin = self.context.story_gherkin(story_id)
            tech_spec = self.context.story_technical_spec(story_id)
            stories.append({
                "story_id": story_id,
                "title": entry.get("title", ""),
                "epic_title": entry.get("epic_title", ""),
                "gherkin_preview": gherkin[:_PREVIEW_CHARS].strip(),
                "tech_spec_preview": tech_spec[:_PREVIEW_CHARS].strip(),
            })
        return sorted(stories, key=lambda s: s["story_id"])

    def get_story_context(self, ctx: RequestContext, story_id: int) -> dict:
        self.configure_request(ctx)
        index = self.context.story_index()
        entry = index.get(str(story_id)) or {}
        if not entry:
            raise Phase3ValidationError(f"Story {story_id} not found in index.")
        return {
            "story_id": story_id,
            "title": entry.get("title", ""),
            "gherkin": self.context.story_gherkin(story_id),
            "technical_spec": self.context.story_technical_spec(story_id),
            "project_concept": self.context.read_project_concept(),
            "tech_stack": self.context.read_tech_stack(),
            "design_bundle": self.context.read_context_file("design-bundle.md"),
        }

    def generate_tasks(self, ctx: RequestContext, story_id: int) -> list[dict]:
        self.configure_request(ctx)
        index = self.context.story_index()
        entry = index.get(str(story_id)) or {}
        if entry.get("phase_status") != "design_locked":
            raise Phase3ValidationError(
                f"Story {story_id} is not design_locked (status: {entry.get('phase_status')!r})."
            )
        story_title = entry.get("title", f"Story {story_id}")
        gherkin = self.context.story_gherkin(story_id)
        if not gherkin:
            raise Phase3ValidationError(f"Story {story_id} has no Gherkin content.")
        technical_spec = self.context.story_technical_spec(story_id)
        tech_stack = self.context.read_tech_stack()
        design_bundle = self.context.read_context_file("design-bundle.md")
        return self.ai.generate_tasks(
            story_title, gherkin, technical_spec,
            tech_stack=tech_stack, design_bundle=design_bundle,
        )

    def generate_proposal(
        self,
        ctx: RequestContext,
        story_id: int,
        task_id: int,
        task_subject: str,
        task_description: str,
    ) -> str:
        self.configure_request(ctx)
        index = self.context.story_index()
        entry = index.get(str(story_id)) or {}
        story_title = entry.get("title", f"Story {story_id}")
        story_ref = f"US#{story_id} — {story_title}"
        gherkin = self.context.story_gherkin(story_id)
        technical_spec = self.context.story_technical_spec(story_id)
        tech_stack = self.context.read_tech_stack()
        design_bundle = self.context.read_context_file("design-bundle.md")
        return self.ai.generate_proposal(
            task_subject, task_description, gherkin, technical_spec,
            tech_stack=tech_stack, design_bundle=design_bundle, story_ref=story_ref,
        )

    def save_proposal(
        self,
        ctx: RequestContext,
        story_id: int,
        task_id: int,
        proposal_md: str,
    ) -> None:
        self.configure_request(ctx)
        self.context.save_proposal(story_id, task_id, proposal_md)

    def lock_story(self, ctx: RequestContext, story_id: int) -> None:
        self.configure_request(ctx)
        self.context.upsert_story_index(
            story_id, phase_status="implementation", has_proposal=True,
        )
