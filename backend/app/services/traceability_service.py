"""Living traceability graph — a pure, project-wide derivation graph.

Reads the story-index + context files (no AI) and emits {nodes, edges} spanning
epic → story → Gherkin → tasks → tests → deploy, plus a project-level Design
node and the cross-story conflict / backward-trace overlays. Mirrors the
design-conflict detector: set arithmetic over data Apex already persists. All
access goes through ContextService for project isolation.
"""

from __future__ import annotations

from backend.app.api.deps import RequestContext
from backend.app.services.context_service import ContextService


def _phase_for_status(status: str) -> int:
    """Best phase to land on when a story node is clicked, from its status."""
    return {
        "new": 1,
        "gherkin_locked": 2,
        "design_locked": 3,
        "implementation": 3,
        "qa": 4,
        "qa_passed": 5,
        "deployed": 5,
    }.get(status, 1)


class TraceabilityService:
    def __init__(self, context: ContextService | None = None):
        self.context = context or ContextService()

    def build_graph(self, ctx: RequestContext, include_scenarios: bool = False) -> dict:
        from src import ai_engine

        context = self.context
        context.set_active(ctx)
        index = context.story_index()

        # Cross-story conflict pairs (pure) — reuse the design-conflict detector.
        try:
            conflicts = ai_engine.detect_design_conflicts(context.list_all_proposals())
        except Exception:
            conflicts = {}

        nodes: list[dict] = []
        edges: list[dict] = []
        seen_edges: set[tuple[str, str, str]] = set()

        def add_edge(source: str, target: str, kind: str) -> None:
            key = (source, target, kind)
            if source == target or key in seen_edges:
                return
            seen_edges.add(key)
            edges.append({"id": f"{kind}:{source}->{target}", "source": source, "target": target, "kind": kind})

        nodes.append({"id": "project", "type": "project", "label": "Project"})

        has_design = any(e.get("has_tech_spec") for e in index.values())
        if has_design:
            nodes.append({"id": "design", "type": "design", "label": "Design", "phase": 2})
            add_edge("project", "design", "derive")

        seen_epics: set[str] = set()
        for sid, entry in index.items():
            epic_id = entry.get("epic_id")
            epic_node = f"epic:{epic_id}"
            if epic_node not in seen_epics:
                seen_epics.add(epic_node)
                nodes.append({"id": epic_node, "type": "epic", "label": f"Epic {epic_id}", "phase": 1})
                add_edge("project", epic_node, "derive")

            status = entry.get("phase_status", "new")
            story_node = f"story:{sid}"
            nodes.append({
                "id": story_node,
                "type": "story",
                "label": entry.get("title", f"Story {sid}"),
                "story_id": entry.get("story_id"),
                "phase_status": status,
                "phase": _phase_for_status(status),
                "flags": {
                    "conflict": bool(entry.get("design_conflict")),
                    "trace": bool(entry.get("trace_flag")),
                    "bug": bool(entry.get("has_bug_report")) or bool(entry.get("fix_bolt_count")),
                },
            })
            add_edge(epic_node, story_node, "derive")

            prev = story_node
            if entry.get("has_gherkin"):
                gh_node = f"gherkin:{sid}"
                try:
                    titles = ai_engine._parse_gherkin_titles(context.story_gherkin(int(sid)))
                except Exception:
                    titles = []
                nodes.append({"id": gh_node, "type": "gherkin", "label": "Gherkin",
                              "story_id": entry.get("story_id"), "phase": 1, "scenario_count": len(titles)})
                add_edge(prev, gh_node, "derive")
                if include_scenarios and titles:
                    try:
                        verif = context.load_verification(int(sid)) or {}
                    except Exception:
                        verif = {}
                    rows = {r.get("scenario", ""): r for r in verif.get("scenarios", [])}
                    has_tests = bool(entry.get("has_bdd"))
                    for i, title in enumerate(titles):
                        sc_node = f"scenario:{sid}:{i}"
                        row = rows.get(title)
                        verified = bool(row and row.get("qa_result") == "passed")
                        nodes.append({
                            "id": sc_node, "type": "scenario", "label": title,
                            "story_id": entry.get("story_id"), "phase": 1,
                            "verified": verified,
                            "flags": {"gap": bool(row and row.get("gaps"))},
                        })
                        add_edge(gh_node, sc_node, "derive")
                        if verified and has_tests:
                            add_edge(sc_node, f"tests:{sid}", "verify")
                prev = gh_node

            if entry.get("has_tech_spec"):
                add_edge(story_node, "design", "design")

            if entry.get("has_proposal"):
                tk_node = f"tasks:{sid}"
                nodes.append({"id": tk_node, "type": "tasks", "label": "Tasks",
                              "story_id": entry.get("story_id"), "phase": 3})
                add_edge(prev, tk_node, "derive")
                prev = tk_node

            if entry.get("has_bdd"):
                ts_node = f"tests:{sid}"
                nodes.append({"id": ts_node, "type": "tests", "label": "Tests",
                              "story_id": entry.get("story_id"), "phase": 4})
                add_edge(prev, ts_node, "derive")
                prev = ts_node

            if entry.get("has_deploy_pack") or entry.get("has_infra_delta"):
                dp_node = f"deploy:{sid}"
                nodes.append({"id": dp_node, "type": "deploy", "label": "Deploy",
                              "story_id": entry.get("story_id"), "phase": 5})
                add_edge(prev, dp_node, "derive")

        # Cross-story conflict edges (amber).
        for sid, info in conflicts.items():
            for other in info.get("conflicts_with", []):
                add_edge(f"story:{sid}", f"story:{other}", "conflict")

        # Backward-trace edges (violet, dashed): downstream gap → source artifact.
        for sid, entry in index.items():
            if not entry.get("trace_flag"):
                continue
            tphase = entry.get("trace_phase")
            target = f"gherkin:{sid}" if tphase == "gherkin_locked" else ("design" if tphase == "design_locked" else None)
            if target:
                add_edge(f"story:{sid}", target, "trace")

        return {"nodes": nodes, "edges": edges}
