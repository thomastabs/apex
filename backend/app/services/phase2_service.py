"""Phase 2 architectural and UX design workflow service."""

import re

from backend.app.services.ai_service import AiService
from backend.app.services.context_service import ContextService
from backend.app.services.request_context import RequestContext
from backend.app.services.taiga_service import TaigaService


class Phase2ValidationError(ValueError):
    """Raised when a Phase 2 request is structurally invalid."""


class Phase2Service:
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

    def tech_stack_status(self, ctx: RequestContext) -> dict:
        self.configure_request(ctx)
        tech_stack = self._extract_tech_stack(self.context.read_memory_bank())
        return {"defined": bool(tech_stack), "tech_stack": tech_stack or None}

    def eligible_epics(self, ctx: RequestContext) -> list[dict]:
        self.configure_request(ctx)
        index = self.context.story_index()
        epics_by_id = {epic["id"]: epic for epic in self.taiga.get_epics()}
        grouped: dict[int, list[dict]] = {}
        for entry in index.values():
            epic_id = entry.get("epic_id")
            if not epic_id:
                continue
            if not entry.get("has_gherkin"):
                continue
            if entry.get("phase_status") not in ("gherkin_locked", "design_locked"):
                continue
            grouped.setdefault(int(epic_id), []).append(entry)

        result = []
        for epic_id, stories in sorted(grouped.items()):
            epic = epics_by_id.get(epic_id, {})
            all_design_locked = all(
                story.get("phase_status") == "design_locked" for story in stories
            )
            result.append({
                "epic_id": epic_id,
                "epic_title": epic.get("subject") or f"Epic {epic_id}",
                "story_count": len(stories),
                "phase_status": "design_locked" if all_design_locked else "gherkin_locked",
            })
        return result

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

    def generate_design_bundle(self, ctx: RequestContext, *, epic_id: int) -> dict:
        self.configure_request(ctx)
        if epic_id <= 0:
            raise Phase2ValidationError("epic_id must be greater than zero.")
        memory_bank = self.context.read_memory_bank()
        tech_stack = self._extract_tech_stack(memory_bank)
        if not tech_stack:
            raise Phase2ValidationError("A locked Tech Stack is required before generating designs.")
        stories = self._stories_for_epic(epic_id)
        if not stories:
            raise Phase2ValidationError("No Phase 1 locked Gherkin stories found for this epic.")
        epic = self.taiga.get_epic(epic_id)
        constrained_context = (
            f"{memory_bank.strip()}\n\n"
            "## Phase 2 Locked Tech Stack Constraint\n\n"
            "The following Tech Stack is locked and binding. The generated design bundle "
            "must not introduce technologies, frameworks, runtimes, databases, or deployment "
            f"targets outside this stack:\n\n{tech_stack}"
        )
        bundle = self.ai.generate_phase2_design(
            epic.get("subject", f"Epic {epic_id}"),
            stories,
            constrained_context,
            self.context.other_epics_design_context(epic_id),
        )
        return {
            **bundle,
            "story_ids": [story["story_id"] for story in stories],
        }

    def lock_epic_design(
        self,
        ctx: RequestContext,
        *,
        epic_id: int,
        epic_title: str,
        story_ids: list[int],
        wireframes: str,
        user_flow: str,
        component_tree: str,
        tech_spec: str,
    ) -> dict:
        self.configure_request(ctx)
        if epic_id <= 0:
            raise Phase2ValidationError("epic_id must be greater than zero.")
        if not tech_spec.strip():
            raise Phase2ValidationError("tech_spec is required.")

        title = epic_title.strip()
        if not title:
            title = self.taiga.get_epic(epic_id).get("subject", f"Epic {epic_id}")

        locked_story_ids = story_ids or [story["story_id"] for story in self._stories_for_epic(epic_id)]
        if not locked_story_ids:
            raise Phase2ValidationError("At least one story_id is required.")

        self.context.append_epic_technical_spec(epic_id, title, locked_story_ids, tech_spec)
        self.context.append_memory_bank_design(
            epic_id,
            title,
            prototype_summary=wireframes,
            tech_spec_summary=tech_spec,
        )
        self.context.append_epic_design_bundle(
            epic_id,
            title,
            wireframes,
            user_flow,
            component_tree,
            tech_spec,
        )

        failures = self._transition_taiga_stories(locked_story_ids)
        return {
            "ok": not failures,
            "epic_id": epic_id,
            "story_ids": locked_story_ids,
            "taiga_failures": failures,
        }

    def _stories_for_epic(self, epic_id: int) -> list[dict]:
        stories = []
        for entry in self.context.story_index().values():
            if entry.get("epic_id") != epic_id:
                continue
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
            stories.append({
                "story_id": story_id,
                "title": entry.get("title", ""),
                "gherkin": gherkin,
            })
        return sorted(stories, key=lambda item: item["story_id"])

    def _transition_taiga_stories(self, story_ids: list[int]) -> list[dict]:
        failures = []
        status_id = self.taiga.find_design_locked_status_id()
        for story_id in story_ids:
            try:
                story = self.taiga.get_story(story_id)
                tags = sorted({*story.get("tags", []), "apex", "design_locked"})
                self.taiga.update_story_fields(
                    story_id,
                    story["version"],
                    tags=tags,
                    status_id=status_id,
                )
            except Exception as exc:
                failures.append({"story_id": story_id, "error": str(exc)})
        return failures

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
