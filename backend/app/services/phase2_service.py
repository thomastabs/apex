"""Phase 2 architectural and UX design workflow service."""

import logging

from backend.app.services.ai_service import AiService
from backend.app.services.context_service import ContextService
from backend.app.services.request_context import RequestContext

_logger = logging.getLogger("apex.phase2_service")


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
        self.context.set_active(ctx)

    def tech_stack_status(self, ctx: RequestContext) -> dict:
        self.configure_request(ctx)
        tech_stack = (self.context.read_tech_stack() or "").strip()
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
        return self.ai.suggest_tech_stack(all_stories, self.context.read_tech_stack(), hint)

    def lock_tech_stack(self, ctx: RequestContext, *, tech_stack: str) -> dict:
        self.configure_request(ctx)
        clean = tech_stack.strip()
        if not clean:
            raise Phase2ValidationError("tech_stack is required.")
        self.context.write_tech_stack(clean)
        return {"defined": True, "tech_stack": clean}

    DESIGN_SECTION_ORDER = ("ux_brief", "endpoints", "data_model")

    def generate_design_section(
        self,
        ctx: RequestContext,
        *,
        section: str,
        prior_sections: dict[str, str] | None = None,
        instructions: str = "",
    ) -> dict:
        if section not in self.DESIGN_SECTION_ORDER:
            raise Phase2ValidationError(f"Unknown section: {section!r}")
        self.configure_request(ctx)
        tech_stack = self.context.read_tech_stack()
        if not tech_stack:
            raise Phase2ValidationError("A locked Tech Stack is required before generating designs.")
        all_stories = self._all_eligible_stories()
        if not all_stories:
            raise Phase2ValidationError("No Phase 1 locked Gherkin stories found.")
        project_concept = self.context.read_project_concept()
        constrained_context = self._build_constrained_context(project_concept, tech_stack)
        content = self.ai.generate_design_section(
            all_stories, constrained_context, section, prior_sections or {},
            instructions=instructions,
        )
        return {
            "section": section,
            "content": content,
            "story_ids": [s["story_id"] for s in all_stories],
        }

    def cross_check_endpoints(self, ctx: RequestContext, *, ux_brief: str, alt_model: str = "") -> dict:
        """Derive design endpoints with the active model AND a second configured
        provider (same UX brief), returning the contract diff."""
        from src import ai_engine

        self.configure_request(ctx)
        tech_stack = self.context.read_tech_stack()
        if not tech_stack:
            raise Phase2ValidationError("A locked Tech Stack is required before generating designs.")
        all_stories = self._all_eligible_stories()
        if not all_stories:
            raise Phase2ValidationError("No Phase 1 locked Gherkin stories found.")
        primary = ai_engine.get_model()
        alt = self.ai.resolve_alt_model(primary, alt_model)
        if not alt:
            raise Phase2ValidationError(
                "Cross-check needs a second AI provider — add another provider's API key (OpenAI/Google)."
            )
        constrained_context = self._build_constrained_context(self.context.read_project_concept(), tech_stack)
        labels = {m["id"]: m.get("label", m["id"]) for m in ai_engine.AVAILABLE_MODELS}
        diff = self.ai.cross_check_endpoints(
            all_stories, constrained_context, ux_brief=ux_brief,
            primary_model=primary, alt_model=alt,
        )
        return {
            "primary_model": primary, "primary_label": labels.get(primary, primary),
            "alt_model": alt, "alt_label": labels.get(alt, alt), **diff,
        }

    def _build_constrained_context(self, project_concept: str, tech_stack: str) -> str:
        parts = []
        if project_concept.strip():
            parts.append(f"## Project Concept\n\n{project_concept.strip()}")
        parts.append(f"## Tech Stack\n\n{tech_stack.strip()}")
        parts.append(
            "## Locked Tech Stack Constraint\n\n"
            "The following Tech Stack is locked and binding. The generated design "
            "must not introduce technologies, frameworks, runtimes, databases, or deployment "
            f"targets outside this stack:\n\n{tech_stack}"
        )
        github_context = self.context.read_context_file("github-context.md")
        if github_context.strip() and not github_context.strip().startswith("<!--"):
            parts.append(f"## Existing Codebase (GitHub)\n\n{github_context.strip()}")
        return "\n\n".join(parts)

    def persist_design(
        self,
        ctx: RequestContext,
        *,
        story_ids: list[int],
        ux_brief: str,
        endpoints: str,
        data_model: str,
    ) -> dict:
        if not story_ids:
            raise Phase2ValidationError("At least one story_id is required.")
        self.configure_request(ctx)
        self.context.write_project_design_bundle(ux_brief)
        self.context.write_project_technical_spec(story_ids, endpoints, data_model)
        return {"ok": True, "story_ids": story_ids, "taiga_failures": []}

    def load_design(self, ctx: RequestContext) -> dict[str, str]:
        """Re-hydrate the locked project design (UX brief / endpoints / data
        model) from design-bundle.md so the Phase 2 UI does not depend on
        browser-local draft state. Empty strings when nothing is locked yet."""
        self.configure_request(ctx)
        return self.context.read_project_design_bundle()

    def generate_diagram(self, ctx: RequestContext, *, data_model_md: str) -> dict:
        self.configure_request(ctx)
        result = self.ai.generate_er_diagram(data_model_md)
        nodes = [
            {
                "id": e.id,
                "type": "entity",
                "position": {"x": 0, "y": 0},
                "data": {"label": e.label, "fields": [f.model_dump() for f in e.fields]},
            }
            for e in result.entities
        ]
        edges = [
            {"id": e.id, "source": e.source, "target": e.target, "label": e.label, "animated": False}
            for e in result.edges
        ]
        diagram = {"nodes": nodes, "edges": edges}
        self.context.save_er_diagram(diagram)
        return diagram

    def load_diagram(self, ctx: RequestContext) -> dict | None:
        self.configure_request(ctx)
        return self.context.load_er_diagram()

    def save_diagram_positions(self, ctx: RequestContext, *, nodes: list[dict]) -> None:
        self.configure_request(ctx)
        diagram = self.context.load_er_diagram() or {"nodes": [], "edges": []}
        pos_map = {n["id"]: n["position"] for n in nodes}
        for node in diagram["nodes"]:
            if node["id"] in pos_map:
                node["position"] = pos_map[node["id"]]
        self.context.save_er_diagram(diagram)

    def generate_screen_flow(self, ctx: RequestContext, *, ux_brief_md: str) -> dict:
        self.configure_request(ctx)
        result = self.ai.generate_screen_flow(ux_brief_md)
        nodes = [
            {
                "id": n.id,
                "type": "screen",
                "position": {"x": 0, "y": 0},
                "data": {"label": n.label, "description": n.description},
            }
            for n in result.nodes
        ]
        edges = [
            {"id": e.id, "source": e.source, "target": e.target, "label": e.label, "animated": False}
            for e in result.edges
        ]
        diagram = {"nodes": nodes, "edges": edges}
        self.context.save_screen_flow(diagram)
        return diagram

    def load_screen_flow(self, ctx: RequestContext) -> dict | None:
        self.configure_request(ctx)
        return self.context.load_screen_flow()

    def save_screen_flow_positions(self, ctx: RequestContext, *, nodes: list[dict]) -> None:
        self.configure_request(ctx)
        diagram = self.context.load_screen_flow() or {"nodes": [], "edges": []}
        pos_map = {n["id"]: n["position"] for n in nodes}
        for node in diagram["nodes"]:
            if node["id"] in pos_map:
                node["position"] = pos_map[node["id"]]
        self.context.save_screen_flow(diagram)

    def _all_eligible_stories(self) -> list[dict]:
        """Return all stories with locked Gherkin, sorted by story_id."""
        stories = []
        for entry in self.context.story_index().values():
            if entry.get("phase_status") not in ("gherkin_locked", "design_locked"):
                continue
            story_id = entry.get("story_id")
            if not story_id:
                continue
            gherkin = self.context.story_gherkin(story_id)
            if not gherkin:
                _logger.warning("_all_eligible_stories: story %s has empty gherkin file — skipping", story_id)
                continue
            epic_id = entry.get("epic_id")
            epic_title = entry.get("epic_title") or (f"Epic {epic_id}" if epic_id else "")
            stories.append({
                "story_id": story_id,
                "epic_id": epic_id,
                "epic_title": epic_title,
                "title": entry.get("title", ""),
                "gherkin": gherkin,
            })
        return sorted(stories, key=lambda s: s["story_id"])
