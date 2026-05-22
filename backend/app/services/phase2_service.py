"""Phase 2 architectural and UX design workflow service."""

import re

from backend.app.services.ai_service import AiService
from backend.app.services.context_service import ContextService
from backend.app.services.request_context import RequestContext


class Phase2ValidationError(ValueError):
    """Raised when a Phase 2 request is structurally invalid."""


class Phase2Service:
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

    def tech_stack_status(self, ctx: RequestContext) -> dict:
        self.configure_request(ctx)
        tech_stack = self._extract_tech_stack(self.context.read_memory_bank())
        return {"defined": bool(tech_stack), "tech_stack": tech_stack or None}

    def propose_tech_stack(self, ctx: RequestContext, *, hint: str = "") -> list[dict]:
        self.configure_request(ctx)
        index = self.context.story_index()
        all_stories = []
        for entry in index.values():
            if not entry.get("has_gherkin"):
                continue
            if entry.get("phase_status") not in ("gherkin_locked", "design_locked"):
                continue
            story_id = entry.get("story_id")
            gherkin = self.context.story_gherkin(story_id) if story_id else ""
            all_stories.append({
                "epic_title": entry.get("epic_title", ""),
                "title": entry.get("title", ""),
                "gherkin": gherkin,
            })
        if not all_stories:
            raise Phase2ValidationError("No Phase 1 locked Gherkin stories are available.")
        return self.ai.suggest_tech_stack(all_stories, self.context.read_memory_bank(), hint)

    def lock_tech_stack(self, ctx: RequestContext, *, tech_stack: str) -> dict:
        self.configure_request(ctx)
        clean = tech_stack.strip()
        if not clean:
            raise Phase2ValidationError("tech_stack is required.")
        self.context.write_tech_stack(clean)
        return {"defined": True, "tech_stack": clean}

    def generate_design_bundle(self, ctx: RequestContext, *, epics: list[dict] | None = None) -> dict:
        self.configure_request(ctx)
        memory_bank = self.context.read_memory_bank()
        tech_stack = self._extract_tech_stack(memory_bank)
        if not tech_stack:
            raise Phase2ValidationError("A locked Tech Stack is required before generating designs.")
        all_stories = self._all_eligible_stories(epics=epics)
        if not all_stories:
            raise Phase2ValidationError("No Phase 1 locked Gherkin stories found.")
        constrained_context = (
            f"{memory_bank.strip()}\n\n"
            "## Phase 2 Locked Tech Stack Constraint\n\n"
            "The following Tech Stack is locked and binding. The generated design bundle "
            "must not introduce technologies, frameworks, runtimes, databases, or deployment "
            f"targets outside this stack:\n\n{tech_stack}"
        )
        bundle = self.ai.generate_project_design(all_stories, constrained_context)
        return {
            **bundle,
            "story_ids": [s["story_id"] for s in all_stories],
        }

    def _all_eligible_stories(self, *, epics: list[dict] | None = None) -> list[dict]:
        """Return all stories with locked Gherkin, sorted by story_id."""
        epics_by_id = {epic["id"]: epic for epic in epics} if epics is not None else {}
        stories = []
        for entry in self.context.story_index().values():
            if not entry.get("has_gherkin"):
                continue
            if entry.get("phase_status") not in ("gherkin_locked", "design_locked"):
                continue
            story_id = entry.get("story_id")
            if not story_id:
                continue
            gherkin = self.context.story_gherkin(story_id)
            if not gherkin:
                continue
            epic_id = entry.get("epic_id")
            epic_title = ""
            if epic_id:
                epic_title = epics_by_id.get(epic_id, {}).get("subject") or f"Epic {epic_id}"
            stories.append({
                "story_id": story_id,
                "epic_id": epic_id,
                "epic_title": epic_title,
                "title": entry.get("title", ""),
                "gherkin": gherkin,
            })
        return sorted(stories, key=lambda s: s["story_id"])

    def _extract_tech_stack(self, memory_bank: str) -> str:
        match = re.search(
            r"^## Tech Stack[^\n]*\n(.*?)(?=^## |\Z)",
            memory_bank,
            re.MULTILINE | re.DOTALL,
        )
        if not match:
            return ""
        text = match.group(1).strip()
        if not text or text.startswith("<!--"):
            return ""
        return text
