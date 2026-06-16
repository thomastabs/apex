"""Phase 6 spec↔code conformance service (Traceability Explorer)."""

import logging

from backend.app.services.ai_service import AiService
from backend.app.services.context_service import ContextService
from backend.app.services.request_context import RequestContext

_logger = logging.getLogger("apex.phase6_service")

_PREVIEW_CHARS = 600
# Conformance is a read/report feature — eligible from implementation onward.
_CONFORMANCE_STATUSES = ("implementation", "qa", "qa_passed", "deployed")


class Phase6ValidationError(ValueError):
    """Raised when a Phase 6 request is structurally invalid."""


class Phase6Service:
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
            if entry.get("phase_status", "") not in _CONFORMANCE_STATUSES:
                continue
            story_id = entry.get("story_id")
            if not story_id:
                continue
            report = self.context.load_conformance(story_id)
            stories.append({
                "story_id": story_id,
                "title": entry.get("title", ""),
                "epic_title": entry.get("epic_title", ""),
                "phase_status": entry.get("phase_status", ""),
                "has_conformance": report is not None,
                "score": (report or {}).get("score"),
            })
        return sorted(stories, key=lambda s: s["story_id"])

    def _story_inputs(self, story_id: int) -> dict:
        index = self.context.story_index()
        entry = index.get(str(story_id)) or {}
        if not entry:
            raise Phase6ValidationError(f"Story {story_id} not found in index.")
        status = entry.get("phase_status", "")
        if status not in _CONFORMANCE_STATUSES:
            raise Phase6ValidationError(
                f"Story {story_id} is not eligible for conformance (status: {status!r}). "
                "Implement the story first."
            )
        github_context = self.context.read_context_file("github-context.md")
        # Treat the unpopulated template (header + HTML comments only) as not synced.
        if "## File Tree" not in github_context:
            github_context = ""
        return {
            "title": entry.get("title", f"Story {story_id}"),
            "epic_title": entry.get("epic_title", ""),
            "gherkin": self.context.story_gherkin(story_id),
            "technical_spec": self.context.story_technical_spec(story_id),
            "constraints": self.context.read_context_file("constraints.md"),
            "tech_stack": self.context.read_tech_stack(),
            "github_context": github_context,
        }

    def verify_conformance(
        self, ctx: RequestContext, story_id: int, *, ai: bool = True,
        extra_files: list[dict] | None = None,
    ) -> dict:
        """Run a conformance check and persist it. ai=False → Layer-A only (no LLM).

        extra_files ([{path, content}]) are user-supplied source files appended to
        the synced context so the AI can resolve `unknown` rows (#1 v2 on-demand
        file fetch) without dumping the whole repo.
        """
        self.configure_request(ctx)
        inp = self._story_inputs(story_id)
        github_context = inp["github_context"]
        for f in extra_files or []:
            path, content = f.get("path", ""), f.get("content", "")
            if path and content:
                github_context += f"\n\n## `{path}`\n\n```\n{content}\n```\n"
        precheck = self.ai.layer_a_conformance(
            inp["gherkin"], inp["technical_spec"], github_context, inp["constraints"]
        )
        if ai:
            report = self.ai.verify_conformance(
                inp["title"], inp["gherkin"], inp["technical_spec"], github_context,
                constraints=inp["constraints"], tech_stack=inp["tech_stack"], precheck=precheck,
            )
            report["layer"] = "ai"
        else:
            report = precheck
            report["layer"] = "deterministic"
        report["title"] = inp["title"]
        report["epic_title"] = inp["epic_title"]
        self.context.save_conformance(story_id, report)
        return self.context.load_conformance(story_id) or report

    def get_conformance(self, ctx: RequestContext, story_id: int) -> dict | None:
        self.configure_request(ctx)
        return self.context.load_conformance(story_id)
