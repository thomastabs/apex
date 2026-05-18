"""Phase 1 requirements workflow service."""

import re

from backend.app.services.ai_service import AiService
from backend.app.services.context_service import ContextService
from backend.app.services.request_context import RequestContext
from backend.app.services.taiga_service import TaigaService


class Phase1ValidationError(ValueError):
    """Raised when a Phase 1 request is structurally invalid."""


class Phase1Service:
    def __init__(
        self,
        *,
        ai: AiService | None = None,
        context: ContextService | None = None,
        taiga: TaigaService | None = None,
    ) -> None:
        self.ai = ai or AiService()
        self.context = context or ContextService()
        self.taiga = taiga or TaigaService()

    def configure_request(self, ctx: RequestContext) -> None:
        self.context.set_project(ctx.project_id)
        self.taiga.set_context(ctx.taiga_token, ctx.project_id)

    def list_epics(self, ctx: RequestContext) -> list[dict]:
        self.configure_request(ctx)
        return self.taiga.get_epics()

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

    def push_stories(
        self,
        ctx: RequestContext,
        *,
        epic_subject: str,
        epic_description: str,
        epic_id: int | None,
        stories: list[dict],
    ) -> dict:
        self.configure_request(ctx)
        self._validate_compiled_stories(stories)
        epic = self._resolve_epic(epic_id, epic_subject, epic_description)
        self.context.init_context()
        status_id = self.taiga.find_ready_status_id()

        story_ids: list[int] = []
        story_urls: list[str] = []
        for index, item in enumerate(stories):
            title = item["title"].strip()
            gherkin = item["gherkin"].strip()
            story = self.taiga.create_story(
                title,
                self.ai.bold_gherkin_keywords(gherkin),
                epic_id=epic["id"],
                tags=["apex", "gherkin", item.get("size", "").strip()],
                backlog_order=index,
            )
            if status_id:
                story = self.taiga.update_story_status(story["id"], status_id, story["version"])
            story_obj = self.taiga.get_story(story["id"])
            self.context.append_gherkin(
                story["id"],
                title,
                gherkin,
                epic_id=epic["id"],
                epic_title=epic.get("subject", ""),
            )
            story_ids.append(story["id"])
            url = self.taiga.get_story_url(story_obj.get("ref"))
            if url:
                story_urls.append(url)

        return {
            "ok": True,
            "epic_id": epic["id"],
            "count": len(story_ids),
            "story_ids": story_ids,
            "story_urls": story_urls,
        }

    def _resolve_epic(
        self,
        epic_id: int | None,
        epic_subject: str,
        epic_description: str,
    ) -> dict:
        if epic_id:
            return self.taiga.get_epic(epic_id)
        subject = epic_subject.strip()
        if not subject:
            raise Phase1ValidationError("epic_subject is required when epic_id is not provided.")
        return self.taiga.create_epic(subject, epic_description)

    def _validate_compiled_stories(self, stories: list[dict]) -> None:
        if not stories:
            raise Phase1ValidationError("At least one compiled story is required.")
        errors: list[str] = []
        for index, story in enumerate(stories, start=1):
            title = story.get("title", "").strip()
            gherkin = story.get("gherkin", "").strip()
            label = title or f"Story {index}"
            if not title:
                errors.append(f"Story {index} has no title.")
            if not re.search(r"^\s*Feature:", gherkin, re.MULTILINE):
                errors.append(f"{label} is missing a Feature: header.")
            if not re.search(r"^\s*Scenario", gherkin, re.MULTILINE):
                errors.append(f"{label} is missing a Scenario block.")
        if errors:
            raise Phase1ValidationError(" ".join(errors))
