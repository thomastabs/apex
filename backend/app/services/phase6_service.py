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
        panel: bool = False, extra_files: list[dict] | None = None,
    ) -> dict:
        """Run a conformance check and persist it. ai=False → Layer-A only (no LLM).

        panel=True (requires ai) escalates contested rows through the adversarial
        Prosecutor/Defender/Judge panel (Layer B+); the report then carries a
        `panel_meta` block. extra_files ([{path, content}]) are user-supplied
        source files appended to the synced context so the AI can resolve
        `unknown` rows (#1 v2 on-demand file fetch) without dumping the whole repo.
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
            verify = self.ai.verify_conformance_panel if panel else self.ai.verify_conformance
            report = verify(
                inp["title"], inp["gherkin"], inp["technical_spec"], github_context,
                constraints=inp["constraints"], tech_stack=inp["tech_stack"], precheck=precheck,
            )
            report["layer"] = "panel" if panel else "ai"
        else:
            report = precheck
            report["layer"] = "deterministic"
        report["title"] = inp["title"]
        report["epic_title"] = inp["epic_title"]
        self.context.save_conformance(story_id, report)
        self._apply_trace(story_id, report)
        return self.context.load_conformance(story_id) or report

    def _apply_trace(self, story_id: int, report: dict) -> None:
        """Backward trace: set/clear the story's trace_flag from a conformance
        report's failing rows (suggest re-opening the source spec phase)."""
        from src import ai_engine

        summary = ai_engine.summarize_trace(ai_engine.derive_trace_targets(report))
        if summary:
            self.context.set_trace_flag(story_id, summary["phase"], summary["reason"])
        else:
            self.context.clear_trace_flag(story_id)

    def get_conformance(self, ctx: RequestContext, story_id: int) -> dict | None:
        self.configure_request(ctx)
        return self.context.load_conformance(story_id)

    def _check_one_regression(self, ctx: RequestContext, story_id: int, title: str, *, panel: bool = False) -> dict:
        """Re-verify one story's conformance and flag/clear conformance_regressed.

        Shared by scan_regressions (all eligible stories, human-triggered) and
        scan_regressions_for_stories (a specific subset, e.g. webhook-triggered
        for only the stories whose files a push touched).
        """
        from src import ai_engine

        old = self.context.load_conformance(story_id) or {}
        new = self.verify_conformance(ctx, story_id, ai=True, panel=panel)
        diff = ai_engine.diff_conformance(old, new)
        if diff["regressed"]:
            reason = (
                f"score {old.get('score', 0)}→{new.get('score', 0)}, "
                f"{len(diff['worsened_rows'])} row(s) worsened"
            )
            self.context.set_conformance_regressed(story_id, reason)
        else:
            # Recovery (or steady): clear any stale flag.
            self.context.clear_conformance_regressed(story_id)
        return {
            "story_id": story_id,
            "title": title,
            "old_score": old.get("score"),
            "new_score": new.get("score", 0),
            "regressed": diff["regressed"],
            "worsened_rows": diff["worsened_rows"],
        }

    def scan_regressions(self, ctx: RequestContext, *, panel: bool = False) -> dict:
        """Re-verify every story that already has a conformance report against the
        freshly-synced code and flag any whose conformance regressed.

        Spec-anchored regression agent: for each eligible story with a prior
        report, capture the old report, re-run verify (persists the new one),
        then compare with the pure `ai_engine.diff_conformance`. A regression
        (lower score OR a worsened row) raises `conformance_regressed`; a
        previously-flagged story that recovered is cleared automatically.
        On-demand, sequential (single-writer safe).
        """
        self.configure_request(ctx)
        eligible = self.get_eligible_stories(ctx)
        results = [
            self._check_one_regression(ctx, s["story_id"], s["title"], panel=panel)
            for s in eligible if s["has_conformance"]
        ]
        regressed_ids = sorted(r["story_id"] for r in results if r["regressed"])
        return {"results": results, "regressed_ids": regressed_ids}

    # Cap how many stories one push can trigger AI re-verification for — a push
    # touching many files (a big refactor, a vendored-dep bump) must not turn
    # into an unbounded AI bill from a single webhook delivery.
    MAX_WEBHOOK_REGRESSION_STORIES = 10

    def scan_regressions_for_stories(self, ctx: RequestContext, story_ids: list[int], *, panel: bool = False) -> dict:
        """Re-verify a specific subset of stories (already has_conformance only —
        same eligibility as scan_regressions). Used by the GitHub webhook handler
        to re-check only the stories whose dev-pack files a push touched, instead
        of the whole project."""
        self.configure_request(ctx)
        by_id = {s["story_id"]: s for s in self.get_eligible_stories(ctx) if s["has_conformance"]}
        targets = [sid for sid in story_ids if sid in by_id][: self.MAX_WEBHOOK_REGRESSION_STORIES]
        results = [
            self._check_one_regression(ctx, sid, by_id[sid]["title"], panel=panel)
            for sid in targets
        ]
        regressed_ids = sorted(r["story_id"] for r in results if r["regressed"])
        return {"results": results, "regressed_ids": regressed_ids}

    def acknowledge_regression(self, ctx: RequestContext, story_id: int) -> None:
        self.configure_request(ctx)
        self.context.clear_conformance_regressed(story_id)
