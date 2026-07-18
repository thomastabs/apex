"""Phase 1 requirements workflow service."""

from pathlib import Path

from backend.app.services.ai_service import AiService
from backend.app.services.context_service import ContextService
from backend.app.services.request_context import RequestContext

_EXTRA_CONTEXT_MAX_CHARS_PER_FILE = 20_000
_EXTRA_CONTEXT_MAX_TOTAL_CHARS = 60_000
_EXTRA_CONTEXT_FILES = {
    "project-concept.md",
    "tech-stack.md",
    "functional-spec.md",
    "technical-spec.md",
    "constraints.md",
    "fix-log.md",
    "decisions.md",
    "design-bundle.md",
    "runtime-spec.md",
    "github-context.md",
    "figma-context.md",
}
_REPO_ROOT = Path(__file__).resolve().parents[3]
_AGENT_CONTEXT_FILES = {
    "AGENTS.md",
    "CLAUDE.md",
    "CODEX.md",
    "GEMINI.md",
}


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

    def _extra_context_block(self, filenames: list[str] | None) -> str:
        if not filenames:
            return ""
        seen: set[str] = set()
        total = 0
        sections: list[str] = []
        for filename in filenames:
            name = filename.strip()
            if not name or name in seen:
                continue
            seen.add(name)
            if name in _EXTRA_CONTEXT_FILES:
                content = self.context.read_context_file(name).strip()
            elif name in _AGENT_CONTEXT_FILES:
                content = self._read_agent_context_file(name).strip()
            else:
                raise Phase1ValidationError(f"Unknown extra context file: {name}")
            if not content:
                continue
            remaining = _EXTRA_CONTEXT_MAX_TOTAL_CHARS - total
            if remaining <= 0:
                break
            clipped = content[: min(len(content), _EXTRA_CONTEXT_MAX_CHARS_PER_FILE, remaining)]
            total += len(clipped)
            suffix = "\n\n[truncated]" if len(clipped) < len(content) else ""
            sections.append(f"### {name}\n\n{clipped}{suffix}")
        if not sections:
            return ""
        return "\n\n## Additional Grounding Files\n\n" + "\n\n".join(sections)

    def _read_agent_context_file(self, filename: str) -> str:
        path = (_REPO_ROOT / filename).resolve()
        if path.parent != _REPO_ROOT:
            raise Phase1ValidationError(f"Invalid extra context file: {filename}")
        if not path.exists():
            return ""
        try:
            return path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise Phase1ValidationError(f"Agent context file must be UTF-8 text: {filename}") from exc

    def _with_extra_context(self, text: str, filenames: list[str] | None) -> str:
        return (text or "") + self._extra_context_block(filenames)

    def suggest_epics(self, ctx: RequestContext, *, hint: str = "", extra_context_files: list[str] | None = None) -> list[dict]:
        self.configure_request(ctx)
        concept = self._with_extra_context(self.context.project_concept(), extra_context_files)
        return self.ai.suggest_epics(concept, hint)

    def analyze_gaps(
        self, ctx: RequestContext, *, existing_epics: list[dict], hint: str = "", extra_context_files: list[str] | None = None,
    ) -> dict:
        """Audit current epics/stories against the concept; report coverage gaps."""
        self.configure_request(ctx)
        concept = self._with_extra_context(self.context.project_concept(), extra_context_files)
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
        extra_context_files: list[str] | None = None,
    ) -> tuple[str, int]:
        self.configure_request(ctx)
        subject = epic_subject.strip()
        if not subject:
            raise Phase1ValidationError("epic_subject is required.")
        concept = self._with_extra_context(self.context.project_concept(), extra_context_files)
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
        extra_context_files: list[str] | None = None,
    ) -> tuple[str, int]:
        self.configure_request(ctx)
        if not frames:
            raise Phase1ValidationError("At least one Figma frame is required.")
        concept = self._with_extra_context(self.context.project_concept(), extra_context_files)
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
        extra_context_files: list[str] | None = None,
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
            hint=hint, project_concept=self._with_extra_context(self.context.project_concept(), extra_context_files),
            primary_model=primary, alt_model=alt,
        )
        return {
            "primary_model": primary,
            "primary_label": labels.get(primary, primary),
            "alt_model": alt,
            "alt_label": labels.get(alt, alt),
            **diff,
        }

    def generate_clarifying_questions(
        self,
        ctx: RequestContext,
        *,
        epic_subject: str,
        epic_description: str = "",
        nl_draft: str,
        hint: str = "",
        extra_context_files: list[str] | None = None,
    ) -> list[dict]:
        self.configure_request(ctx)
        if not nl_draft.strip():
            raise Phase1ValidationError("nl_draft is required.")
        concept = self._with_extra_context(self.context.project_concept(), extra_context_files)
        return self.ai.generate_clarifying_questions(
            epic_subject, epic_description, nl_draft,
            project_concept=concept, hint=hint,
        )

    def compile_gherkin(self, *, nl_draft: str, clarifications: list[dict] | None = None) -> list[dict]:
        if not nl_draft.strip():
            raise Phase1ValidationError("nl_draft is required.")
        return self.ai.compile_gherkin(nl_draft, clarifications)

    def _all_stories(self) -> list[dict]:
        """Epic + story titles from the index — scope signal for constraint sizing."""
        return [
            {"epic_title": e.get("epic_title", "General"), "title": e.get("title", "")}
            for e in self.context.story_index().values()
        ]

    def generate_constraints(self, ctx: RequestContext, *, extra_context_files: list[str] | None = None) -> tuple[list[dict], str]:
        """Generate or update EARS constraints for the whole project."""
        self.configure_request(ctx)
        concept = self._with_extra_context(self.context.project_concept(), extra_context_files)
        tech_stack = self.context.read_tech_stack()
        existing_constraints = self.context.read_context_file("constraints.md")
        return self.ai.generate_constraints(
            concept,
            tech_stack,
            self._all_stories(),
            existing_constraints=existing_constraints,
        )

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
        clarifications: list[dict] | None = None,
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
        if epic_id and clarifications:
            self.context.save_epic_clarifications(epic_id, epic_subject, clarifications)
        return {
            "ok": True,
            "epic_id": epic_id,
            "count": len(story_ids),
            "story_ids": story_ids,
        }
