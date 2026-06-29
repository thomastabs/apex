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

    def analyze_gaps(
        self, ctx: RequestContext, *, existing_epics: list[dict], hint: str = "",
    ) -> dict:
        """Audit current epics/stories against the concept; report coverage gaps."""
        self.configure_request(ctx)
        concept = self.context.project_concept()
        if not concept.strip():
            raise Phase1ValidationError(
                "A project concept is required before analysing requirement gaps."
            )
        return self.ai.analyze_requirement_gaps(concept, existing_epics, hint)

    def generate_nl_stories(
        self,
        ctx: RequestContext,
        *,
        epic_subject: str,
        epic_description: str,
        hint: str = "",
        instructions: str = "",
        images: list[dict] | None = None,
        figma_token: str = "",
    ) -> tuple[str, int]:
        self.configure_request(ctx)
        subject = epic_subject.strip()
        if not subject:
            raise Phase1ValidationError("epic_subject is required.")
        concept = self.context.project_concept()
        figma_context = self.context.read_context_file("figma-context.md")
        # U1 parity: when a Figma token is supplied and a file is configured for
        # this instance, ground generation on the designed screens that match the
        # epic (multimodal). Advisory — the fetch helper never raises, so a bad
        # token / unset file simply falls back to the text-only (figma_context) path.
        if images is None and figma_token:
            from src import context_manager

            file_key = context_manager.get_instance_figma_file_key()
            if file_key:
                from backend.app.services.figma_fetch import fetch_epic_frame_images

                images = fetch_epic_frame_images(figma_token, file_key, subject) or None
        return self.ai.generate_nl_stories(
            subject,
            epic_description,
            hint=hint,
            project_concept=concept,
            instructions=instructions,
            figma_context=figma_context,
            images=images,
        )

    def generate_stories_from_figma(
        self,
        ctx: RequestContext,
        *,
        frames: list[dict],
        flows: list[dict],
        instructions: str = "",
        figma_token: str = "",
        file_key: str = "",
    ) -> tuple[str, int]:
        self.configure_request(ctx)
        if not frames:
            raise Phase1ValidationError("At least one Figma frame is required.")
        concept = self.context.project_concept()
        # U1: when a token + file key are supplied, render the frames to PNGs and
        # attach them for multimodal grounding. Advisory — the fetch helpers never
        # raise, so a bad token simply falls back to the text-only (names) prompt.
        # No file_key but a token → a multi-file project union; the frame node_ids are
        # file-namespaced (`<file_key>:<raw>`) so each renders against its own file.
        images: list[dict] = []
        if figma_token and file_key:
            from backend.app.services.figma_fetch import fetch_frame_images
            images = fetch_frame_images(figma_token, file_key, frames)
        elif figma_token:
            from backend.app.services.figma_fetch import fetch_frame_images_multi
            images = fetch_frame_images_multi(figma_token, frames)
        return self.ai.generate_stories_from_figma(
            frames,
            flows,
            project_concept=concept,
            instructions=instructions,
            images=images or None,
        )

    def cross_check_stories(
        self,
        ctx: RequestContext,
        *,
        epic_subject: str,
        epic_description: str,
        hint: str = "",
        alt_model: str = "",
    ) -> dict:
        """Run story generation through the active model AND a second configured
        provider, returning the scenario-level diff (agreed / only-in-each)."""
        from src import ai_engine

        self.configure_request(ctx)
        subject = epic_subject.strip()
        if not subject:
            raise Phase1ValidationError("epic_subject is required.")
        primary = ai_engine.get_model()
        alt = self.ai.resolve_alt_model(primary, alt_model)
        if not alt:
            raise Phase1ValidationError(
                "Cross-check needs a second AI provider — add another provider's API key (OpenAI/Google)."
            )
        labels = {m["id"]: m.get("label", m["id"]) for m in ai_engine.AVAILABLE_MODELS}
        diff = self.ai.cross_check_nl_stories(
            subject, epic_description,
            hint=hint, project_concept=self.context.project_concept(),
            primary_model=primary, alt_model=alt,
        )
        return {
            "primary_model": primary,
            "primary_label": labels.get(primary, primary),
            "alt_model": alt,
            "alt_label": labels.get(alt, alt),
            **diff,
        }

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
