"""Phase 2 architectural and UX design workflow service."""

import logging
import re

from backend.app.services.ai_service import AiService
from backend.app.services.context_service import ContextService
from backend.app.services.request_context import RequestContext

_logger = logging.getLogger("apex.phase2_service")


class Phase2ValidationError(ValueError):
    """Raised when a Phase 2 request is structurally invalid."""


def build_screen_flow_diagram(
    frames: list[dict], flows: list[dict], extra_edges: list[dict] | None = None
) -> dict:
    """Pure: Figma frames + prototype flows → React Flow screen-flow diagram.

    Node id = Figma node id; label = frame name; description = page name.
    Edges are flows mapped from frame names to their node ids; flows referencing
    an unknown frame, self-loops, and duplicate edges are dropped.

    `extra_edges` (optional) are id-based cross-file edges
    `[{from_id, to_id, kind}]` — appended after the name-based edges, deduped, and
    tagged `data.kind` so the UI can render them distinctly (e.g. inferred
    cross-file links). Omitting it leaves the output byte-identical.
    """
    valid_ids = {f["node_id"] for f in frames}
    name_to_id: dict[str, str] = {}
    for f in frames:
        # First frame wins on a duplicate name so the edge mapping is deterministic.
        name_to_id.setdefault(f["name"], f["node_id"])
    nodes = [
        {
            "id": f["node_id"],
            "type": "screen",
            "position": {"x": 0, "y": 0},
            "data": {"label": f["name"], "description": f.get("page", "")},
        }
        for f in frames
    ]
    edges = []
    seen: set[str] = set()
    for e in flows:
        src = name_to_id.get(e["from_name"])
        tgt = name_to_id.get(e["to_name"])
        if not src or not tgt or src == tgt:
            continue
        eid = f"{src}->{tgt}"
        if eid in seen:
            continue
        seen.add(eid)
        edges.append({"id": eid, "source": src, "target": tgt, "label": "", "animated": False})
    for e in extra_edges or []:
        src, tgt = e.get("from_id"), e.get("to_id")
        if not src or not tgt or src == tgt or src not in valid_ids or tgt not in valid_ids:
            continue
        eid = f"{src}->{tgt}"
        if eid in seen:
            continue
        seen.add(eid)
        edges.append({
            "id": eid, "source": src, "target": tgt,
            "label": "cross-file", "animated": False, "data": {"kind": e.get("kind", "cross_file")},
        })
    return {"nodes": nodes, "edges": edges}


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
        figma_context = self.context.read_context_file("figma-context.md")
        if figma_context.strip() and not figma_context.strip().startswith("<!--"):
            parts.append(f"## Design Reference (Figma)\n\n{figma_context.strip()}")
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
        # Re-persisting over an already-locked design is a full rewrite of a
        # locked contract — record it as an amendment (MAJOR bump, logged
        # against the previously designed stories) instead of silently
        # replacing the files, which would leave versions stale. Affected ids
        # are captured BEFORE the write so the stories newly locked by this
        # persist aren't logged against their own design.
        relock = self._design_locked()
        affected = self.context.affected_stories_for_spec("technical-spec.md") if relock else []
        self.context.write_project_design_bundle(ux_brief)
        self.context.write_project_technical_spec(story_ids, endpoints, data_model)
        if affected:
            note = "Full project design re-generated and persisted over the locked design."
            self.context.record_amendment("technical-spec.md", note, affected)
            self.context.record_amendment("design-bundle.md", note, affected)
        return {"ok": True, "story_ids": story_ids, "taiga_failures": []}

    def _design_locked(self) -> bool:
        return bool(re.search(r"^## Project Design\b",
                              self.context.read_context_file("technical-spec.md"), re.MULTILINE))

    def design_delta_status(self, ctx: RequestContext) -> dict:
        """Which gherkin-locked stories the locked design does not cover yet."""
        self.configure_request(ctx)
        locked = self._design_locked()
        pending = [
            {k: s[k] for k in ("story_id", "epic_id", "epic_title", "title")}
            for s in self._all_eligible_stories()
            if self.context.story_index().get(str(s["story_id"]), {}).get("phase_status") == "gherkin_locked"
        ] if locked else []
        return {"design_locked": locked, "pending": pending}

    def generate_design_delta(
        self,
        ctx: RequestContext,
        *,
        story_ids: list[int] | None = None,
        instructions: str = "",
    ) -> dict:
        """Additive design pass for stories that arrived after the design lock.

        The locked design (technical-spec.md incl. prior deltas + the UX brief)
        is injected read-only; the AI returns only the additions the new
        stories need, plus a `touches_existing` honesty list.
        """
        self.configure_request(ctx)
        status = self.design_delta_status(ctx)
        if not status["design_locked"]:
            raise Phase2ValidationError("No locked project design yet — use the full design flow first.")
        pending = status["pending"]
        if story_ids:
            wanted = set(story_ids)
            pending = [p for p in pending if p["story_id"] in wanted]
        if not pending:
            raise Phase2ValidationError("No pending gherkin-locked stories to design.")
        pending_ids = {p["story_id"] for p in pending}
        new_stories = [s for s in self._all_eligible_stories() if s["story_id"] in pending_ids]
        tech_stack = self.context.read_tech_stack()
        constrained_context = self._build_constrained_context(self.context.read_project_concept(), tech_stack)
        existing_design = (
            f"{self.context.read_context_file('technical-spec.md').strip()}\n\n"
            f"## UX Brief (design-bundle.md)\n\n"
            f"{self.context.read_project_design_bundle().get('ux_brief', '')}"
        )
        delta = self.ai.generate_design_delta(
            new_stories, constrained_context, existing_design, instructions=instructions,
        )
        return {**delta, "story_ids": sorted(pending_ids)}

    def persist_design_delta(
        self,
        ctx: RequestContext,
        *,
        story_ids: list[int],
        ux_brief_addendum: str,
        endpoints_delta: str,
        data_model_delta: str,
        touches_existing: list[str] | None = None,
        note: str = "",
    ) -> dict:
        """Merge the reviewed delta into the locked sections in place. Purely
        additive → MINOR bump; when the delta touches existing design
        (`touches_existing`), the previously designed stories get a real
        amendment (MAJOR bump, logged) on top."""
        if not story_ids:
            raise Phase2ValidationError("At least one story_id is required.")
        # A genuinely empty delta is legitimate — some stories (infra/tooling/
        # docs work, e.g. "add a local Docker dev environment") need no new
        # UI, endpoints, or data model at all. What must never be silent is
        # an accidental blank submit, so a delta with no content requires an
        # explanatory note instead — that note becomes the record of "why
        # nothing changed" (real gap: these stories previously had no way to
        # ever reach design_locked, so they never appeared in Phase 3).
        if not (ux_brief_addendum.strip() or endpoints_delta.strip() or data_model_delta.strip() or note.strip()):
            raise Phase2ValidationError(
                "An empty delta cannot be persisted without a note — if these stories genuinely "
                "need no design changes, say so in the note (e.g. \"pure infra/tooling, no new "
                "UI/endpoints/data model\")."
            )
        self.configure_request(ctx)
        if not self._design_locked():
            raise Phase2ValidationError("No locked project design yet — use the full design flow first.")
        touches = [t for t in (touches_existing or []) if t.strip()]
        # Previously designed stories, captured before the append promotes the
        # delta's own stories to design_locked.
        affected = [
            sid for sid in self.context.affected_stories_for_spec("technical-spec.md")
            if sid not in set(story_ids)
        ] if touches else []
        result = self.context.append_design_delta(
            story_ids, ux_brief_addendum, endpoints_delta, data_model_delta,
        )
        amended = False
        if touches and affected:
            amendment_note = "Design delta touches existing design: " + "; ".join(touches)
            if note.strip():
                amendment_note += f" — {note.strip()}"
            self.context.record_amendment("technical-spec.md", amendment_note, affected)
            amended = True
        return {
            "ok": True,
            "story_ids": result["story_ids"],
            "versions": result["versions"],
            "amended": amended,
            "affected_story_ids": affected if amended else [],
        }

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

    def build_screen_flow_from_figma(
        self, ctx: RequestContext, *, frames: list[dict], flows: list[dict],
        extra_edges: list[dict] | None = None,
    ) -> dict:
        """Build the screen-flow diagram directly from real Figma frames + prototype
        flows (no AI). Frame node ids become diagram node ids; flows (by frame name)
        become edges. `extra_edges` adds inferred cross-file links (project mode).
        Persists like the AI-generated flow so it survives reloads."""
        self.configure_request(ctx)
        if not frames:
            raise Phase2ValidationError("At least one Figma frame is required.")
        diagram = build_screen_flow_diagram(frames, flows, extra_edges)
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

    def generate_design_system(self, ctx: RequestContext, *, ux_brief_md: str) -> dict:
        self.configure_request(ctx)
        result = self.ai.generate_design_system(ux_brief_md)
        design_system = result.model_dump()
        self.context.save_design_system(design_system)
        return design_system

    def load_design_system(self, ctx: RequestContext) -> dict | None:
        self.configure_request(ctx)
        return self.context.load_design_system()

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
